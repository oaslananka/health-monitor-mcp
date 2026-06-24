import {
  getRuntimeProfile,
  isRemoteSafeProfile,
  isTruthyEnv,
  type RuntimeProfile
} from './config.js';

export type RuntimeTransport = 'stdio' | 'http';

export interface RuntimePolicy {
  allowStdio: boolean;
  profile: RuntimeProfile;
  transport: RuntimeTransport;
}

export interface RuntimePolicyOptions {
  allowStdio?: boolean | undefined;
  profile?: RuntimeProfile | undefined;
  transport?: RuntimeTransport | undefined;
}

export const STDIO_DISABLED_MESSAGE = 'stdio transport is disabled for this runtime profile';
export const STDIO_COMMAND_UNSAFE_MESSAGE =
  'stdio command must be a single executable path without shell syntax';
export const STDIO_COMMAND_NOT_ALLOWED_MESSAGE =
  'stdio command is not allowed by HEALTH_MONITOR_STDIO_ALLOWLIST';

const STDIO_COMMAND_FORBIDDEN_CHARACTERS = [
  ' ',
  '\t',
  '\n',
  '\r',
  '"',
  "'",
  '`',
  ';',
  '|',
  '&',
  '<',
  '>',
  '$',
  '(',
  ')'
];

function hasForbiddenStdioCommandCharacter(command: string): boolean {
  return STDIO_COMMAND_FORBIDDEN_CHARACTERS.some((character) => command.includes(character));
}

function getConfiguredStdioAllowlist(): Set<string> | null {
  const raw = process.env.HEALTH_MONITOR_STDIO_ALLOWLIST?.trim();

  if (!raw) {
    return null;
  }

  const commands = raw
    .split(',')
    .map((command) => command.trim())
    .filter((command) => command.length > 0);

  return commands.length > 0 ? new Set(commands) : null;
}

/** @internal */
export function validateStdioCommandPolicy(command: string): void {
  if (command !== command.trim() || hasForbiddenStdioCommandCharacter(command)) {
    throw new Error(STDIO_COMMAND_UNSAFE_MESSAGE);
  }

  const allowlist = getConfiguredStdioAllowlist();
  if (allowlist && !allowlist.has(command)) {
    throw new Error(STDIO_COMMAND_NOT_ALLOWED_MESSAGE);
  }
}

export function createRuntimePolicy(options: RuntimePolicyOptions = {}): RuntimePolicy {
  const profile = options.profile ?? getRuntimeProfile();
  const transport = options.transport ?? 'stdio';
  const requestedAllowStdio =
    options.allowStdio ?? isTruthyEnv(process.env.HEALTH_MONITOR_ALLOW_STDIO);

  return {
    profile,
    transport,
    allowStdio: isRemoteSafeProfile(profile) ? false : requestedAllowStdio
  };
}
