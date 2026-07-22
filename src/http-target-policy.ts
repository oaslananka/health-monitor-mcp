import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { RuntimeProfile } from './config.js';

export type HttpTargetAddress = {
  address: string;
  family: 4 | 6;
};

export interface ResolvedHttpTarget {
  url: string;
  origin: string;
  hostname: string;
  port: number;
  addresses: HttpTargetAddress[];
  selected_address: string;
  selected_family: 4 | 6;
  allow_private_network: boolean;
}

type HttpTargetPolicyRuntime = {
  lookup: (hostname: string) => Promise<HttpTargetAddress[]>;
};

const INVALID_URL_MESSAGE =
  'HTTP target URL must use http or https without credentials or fragment';
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];
const EMBEDDED_IPV4_PATTERN = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/;
const DOTTED_IPV4_MAPPED_PATTERN = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;
const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [base: number, prefix: number]> = [
  [0x00000000, 8], // Current network and unspecified.
  [0x0a000000, 8], // Private-use class A.
  [0x64400000, 10], // Carrier-grade NAT.
  [0x7f000000, 8], // Loopback.
  [0xa9fe0000, 16], // Link-local and cloud metadata.
  [0xac100000, 12], // Private-use class B.
  [0xc0000000, 24], // IETF protocol assignments.
  [0xc0000200, 24], // Documentation range 1.
  [0xc0586300, 24], // Deprecated 6to4 relay anycast.
  [0xc0a80000, 16], // Private-use class C.
  [0xc6120000, 15], // Benchmarking.
  [0xc6336400, 24], // Documentation range 2.
  [0xcb007100, 24], // Documentation range 3.
  [0xe0000000, 4], // Multicast.
  [0xf0000000, 4] // Reserved and limited broadcast.
];

function createDefaultRuntime(): HttpTargetPolicyRuntime {
  return {
    lookup: async (hostname) => {
      const results = await dnsLookup(hostname, { all: true, verbatim: true });
      return results
        .filter(
          (result): result is { address: string; family: 4 | 6 } =>
            result.family === 4 || result.family === 6
        )
        .map((result) => ({ address: result.address, family: result.family }));
    }
  };
}

let runtime = createDefaultRuntime();

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function ipv4ToInteger(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number.parseInt(part, 10);
    if (value < 0 || value > 255) return null;
    result = (result << 8) | value;
  }

  return result >>> 0;
}

function ipv4InCidr(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToInteger(address);
  return (
    value !== null && !BLOCKED_IPV4_CIDRS.some(([base, prefix]) => ipv4InCidr(value, base, prefix))
  );
}

function expandIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();
  const embeddedIpv4 = EMBEDDED_IPV4_PATTERN.exec(normalized);
  if (embeddedIpv4) {
    const value = ipv4ToInteger(embeddedIpv4[2]!);
    if (value === null) return null;
    normalized = `${embeddedIpv4[1]}${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;

  const parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (parts.length !== 8) return null;

  const values = parts.map((part) => Number.parseInt(part, 16));
  return values.every((value, index) => /^[0-9a-f]{1,4}$/.test(parts[index]!) && value <= 0xffff)
    ? values
    : null;
}

function embeddedIpv4FromParts(parts: number[]): string {
  return `${parts[6]! >>> 8}.${parts[6]! & 0xff}.${parts[7]! >>> 8}.${parts[7]! & 0xff}`;
}

function isIpv6Unspecified(parts: number[]): boolean {
  return parts.every((part) => part === 0);
}

function isIpv6Loopback(parts: number[]): boolean {
  return parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
}

function isIpv4CompatibleIpv6(parts: number[]): boolean {
  return parts.slice(0, 6).every((part) => part === 0);
}

function isIpv4MappedIpv6(parts: number[]): boolean {
  return parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
}

function isWellKnownNat64(parts: number[]): boolean {
  return (
    parts[0] === 0x0064 && parts[1] === 0xff9b && parts.slice(2, 6).every((part) => part === 0)
  );
}

function isLocalIpv6Range(parts: number[]): boolean {
  const [first, second, third, fourth] = parts;
  return (
    (first === 0x0064 && second === 0xff9b && third === 0x0001) ||
    (first === 0x0100 && second === 0 && third === 0 && fourth === 0) ||
    (first! & 0xfe00) === 0xfc00 ||
    (first! & 0xffc0) === 0xfe80 ||
    (first! & 0xffc0) === 0xfec0 ||
    (first! & 0xff00) === 0xff00
  );
}

function isProtocolOrDocumentationIpv6Range(parts: number[]): boolean {
  const [first, second, third] = parts;
  return (
    (first === 0x2001 && second === 0x0000) ||
    (first === 0x2001 && second === 0x0db8) ||
    (first === 0x2001 && second === 0x0002 && third === 0) ||
    (first === 0x2001 && (second! & 0xfff0) === 0x0010) ||
    (first === 0x2001 && (second! & 0xfff0) === 0x0020) ||
    first === 0x2002 ||
    (first === 0x3fff && (second! & 0xf000) === 0) ||
    first === 0x5f00
  );
}

function isPublicIpv6(address: string): boolean {
  const dottedMapped = DOTTED_IPV4_MAPPED_PATTERN.exec(address.toLowerCase());
  if (dottedMapped) return isPublicIpv4(dottedMapped[1]!);

  const parts = expandIpv6(address);
  if (!parts || isIpv6Unspecified(parts) || isIpv6Loopback(parts)) return false;
  if (isIpv4CompatibleIpv6(parts)) return false;

  const embeddedIpv4 = embeddedIpv4FromParts(parts);
  if (isIpv4MappedIpv6(parts) || isWellKnownNat64(parts)) {
    return isPublicIpv4(embeddedIpv4);
  }

  return !isLocalIpv6Range(parts) && !isProtocolOrDocumentationIpv6Range(parts);
}

export function isPublicIpAddress(value: string): boolean {
  const address = stripIpv6Brackets(value);
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function normalizeHttpTargetUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.hostname === '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== ''
  ) {
    throw new Error(INVALID_URL_MESSAGE);
  }

  return url.toString();
}

function normalizeAllowlistOrigin(value: string): string {
  const normalized = new URL(normalizeHttpTargetUrl(value));
  if ((normalized.pathname !== '' && normalized.pathname !== '/') || normalized.search !== '') {
    throw new Error('HTTP target allowlist entries must be exact HTTP(S) origins');
  }
  return normalized.origin;
}

function getAllowlist(): Set<string> {
  const origins = new Set<string>();
  for (const entry of process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST?.split(',') ?? []) {
    const value = entry.trim();
    if (!value) continue;
    try {
      origins.add(normalizeAllowlistOrigin(value));
    } catch {
      // Invalid entries never weaken policy.
    }
  }
  return origins;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, '');
  return (
    normalized === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function resolvePort(url: URL): number {
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === 'https:' ? 443 : 80;
}

function deduplicateAndSort(addresses: HttpTargetAddress[]): HttpTargetAddress[] {
  const unique = new Map<string, HttpTargetAddress>();
  for (const entry of addresses) {
    const address = stripIpv6Brackets(entry.address);
    if ((entry.family === 4 || entry.family === 6) && isIP(address) === entry.family) {
      unique.set(`${entry.family}:${address}`, { address, family: entry.family });
    }
  }
  return [...unique.values()].sort(
    (left, right) => left.family - right.family || left.address.localeCompare(right.address)
  );
}

export async function assertHttpTargetUrlAllowed(
  value: string,
  profile: RuntimeProfile
): Promise<ResolvedHttpTarget> {
  const normalizedValue = normalizeHttpTargetUrl(value);
  const url = new URL(normalizedValue);
  const originAllowlisted = getAllowlist().has(url.origin);
  const allowPrivateNetwork = originAllowlisted && profile === 'full';

  if (originAllowlisted && profile !== 'full') {
    throw new Error(`Private HTTP target overrides are disabled for the ${profile} profile.`);
  }

  if (isBlockedHostname(url.hostname) && !allowPrivateNetwork) {
    throw new Error(`${url.hostname} resolves to a non-public network and is not allowed.`);
  }

  const literal = stripIpv6Brackets(url.hostname);
  const family = isIP(literal);
  const rawAddresses = family
    ? [{ address: literal, family: family as 4 | 6 }]
    : await runtime.lookup(url.hostname);
  const addresses = deduplicateAndSort(rawAddresses);

  if (addresses.length === 0) {
    throw new Error(`HTTP target hostname ${url.hostname} did not resolve to an IP address.`);
  }

  const nonPublic = addresses.filter((entry) => !isPublicIpAddress(entry.address));
  if (nonPublic.length > 0 && !allowPrivateNetwork) {
    throw new Error(
      `HTTP target hostname ${url.hostname} resolved to non-public address ${nonPublic[0]!.address}.`
    );
  }

  const selected = addresses[0]!;
  return {
    url: normalizedValue,
    origin: url.origin,
    hostname: stripIpv6Brackets(url.hostname),
    port: resolvePort(url),
    addresses,
    selected_address: selected.address,
    selected_family: selected.family,
    allow_private_network: allowPrivateNetwork
  };
}

/** @internal */
export function setHttpTargetPolicyRuntimeForTests(
  overrides: Partial<HttpTargetPolicyRuntime>
): void {
  runtime = { ...runtime, ...overrides };
}

/** @internal */
export function resetHttpTargetPolicyRuntimeForTests(): void {
  runtime = createDefaultRuntime();
}
