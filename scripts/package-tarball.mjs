import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const TAR_BLOCK_SIZE = 512;
const ZERO_BLOCK = Buffer.alloc(TAR_BLOCK_SIZE);

function readString(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field
    .subarray(0, terminator >= 0 ? terminator : field.length)
    .toString('utf8')
    .trim();
}

function readTarNumber(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);

  if ((field[0] & 0x80) !== 0) {
    const bytes = Buffer.from(field);
    bytes[0] &= 0x7f;
    let value = 0;

    for (const byte of bytes) {
      value = value * 256 + byte;
    }

    return value;
  }

  const value = readString(buffer, offset, length).replace(/\s+/g, '');
  return value === '' ? 0 : Number.parseInt(value, 8);
}

function parsePaxRecords(buffer) {
  const records = {};
  let offset = 0;

  while (offset < buffer.length) {
    const separator = buffer.indexOf(0x20, offset);
    if (separator < 0) break;

    const length = Number.parseInt(buffer.subarray(offset, separator).toString('ascii'), 10);
    if (!Number.isInteger(length) || length <= 0 || offset + length > buffer.length) {
      throw new Error('malformed PAX record');
    }

    const record = buffer.subarray(separator + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals > 0) {
      records[record.slice(0, equals)] = record.slice(equals + 1);
    }

    offset += length;
  }

  return records;
}

function normalizePackagePath(path) {
  let normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('package/')) normalized = normalized.slice('package/'.length);

  if (normalized === '' || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`unsafe package path ${path}`);
  }

  return normalized;
}

function validateHeaderChecksum(header) {
  const expected = readTarNumber(header, 148, 8);
  const checksumHeader = Buffer.from(header);
  checksumHeader.fill(0x20, 148, 156);
  const actual = checksumHeader.reduce((sum, byte) => sum + byte, 0);

  if (expected !== actual) {
    throw new Error(`tar header checksum mismatch: expected ${expected}, received ${actual}`);
  }
}

export function integrityForBuffer(buffer, declaredIntegrity) {
  const separator = declaredIntegrity.indexOf('-');
  const algorithm = separator > 0 ? declaredIntegrity.slice(0, separator) : '';

  if (!['sha256', 'sha384', 'sha512'].includes(algorithm)) {
    throw new Error(`unsupported package integrity algorithm ${algorithm || '(missing)'}`);
  }

  return `${algorithm}-${createHash(algorithm).update(buffer).digest('base64')}`;
}

export function packageFileIndex(tarball) {
  const archive = gunzipSync(tarball);
  const entries = new Map();
  let offset = 0;
  let globalPax = {};
  let nextPax = {};
  let nextLongName;

  while (offset + TAR_BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.equals(ZERO_BLOCK)) break;

    validateHeaderChecksum(header);

    const size = readTarNumber(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0);
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const headerPath = prefix ? `${prefix}/${name}` : name;
    const linkName = readString(header, 157, 100);
    const dataStart = offset + TAR_BLOCK_SIZE;
    const dataEnd = dataStart + size;

    if (dataEnd > archive.length) {
      throw new Error(`tar entry ${headerPath || '(unnamed)'} exceeds archive size`);
    }

    const data = archive.subarray(dataStart, dataEnd);

    if (type === 'g') {
      globalPax = { ...globalPax, ...parsePaxRecords(data) };
    } else if (type === 'x') {
      nextPax = parsePaxRecords(data);
    } else if (type === 'L') {
      nextLongName = data.toString('utf8').replace(/\0.*$/s, '').trimEnd();
    } else {
      const metadata = { ...globalPax, ...nextPax };
      const resolvedPath = metadata.path || nextLongName || headerPath;

      if (type === '\0' || type === '0' || type === '7') {
        const path = normalizePackagePath(resolvedPath);
        if (entries.has(path)) throw new Error(`duplicate package file ${path}`);
        entries.set(path, {
          size: data.length,
          sha256: createHash('sha256').update(data).digest('hex')
        });
      } else if (type === '2') {
        const path = normalizePackagePath(resolvedPath);
        const target = metadata.linkpath || linkName;
        if (entries.has(path)) throw new Error(`duplicate package file ${path}`);
        entries.set(path, {
          size: Buffer.byteLength(target),
          sha256: createHash('sha256').update(`symlink:${target}`).digest('hex')
        });
      }

      nextPax = {};
      nextLongName = undefined;
    }

    offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  if (entries.size === 0) {
    throw new Error('package tarball contains no files');
  }

  return entries;
}

export function assertPackageContentsEqual(localEntries, registryEntries) {
  for (const [path, local] of [...localEntries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const registry = registryEntries.get(path);

    if (!registry) {
      throw new Error(`registry package is missing file ${path}`);
    }

    if (registry.size !== local.size || registry.sha256 !== local.sha256) {
      throw new Error(`package content mismatch for ${path}`);
    }
  }

  for (const path of [...registryEntries.keys()].sort()) {
    if (!localEntries.has(path)) {
      throw new Error(`registry package has unexpected file ${path}`);
    }
  }
}
