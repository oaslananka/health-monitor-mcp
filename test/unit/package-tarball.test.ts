import { gzipSync } from 'node:zlib';

type PackageEntry = {
  size: number;
  sha256: string;
};

type PackageTarballModule = {
  packageFileIndex: (tarball: Buffer) => Map<string, PackageEntry>;
  assertPackageContentsEqual: (
    localEntries: Map<string, PackageEntry>,
    registryEntries: Map<string, PackageEntry>
  ) => void;
  integrityForBuffer: (buffer: Buffer, integrity: string) => string;
};

function writeString(target: Buffer, offset: number, length: number, value: string): void {
  target.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8');
}

function writeOctal(target: Buffer, offset: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, '0');
  writeString(target, offset, length, `${encoded}\0`);
}

function tarEntry(path: string, content: Buffer, options: { mode: number; mtime: number }): Buffer {
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, `package/${path}`);
  writeOctal(header, 100, 8, options.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, content.length);
  writeOctal(header, 136, 12, options.mtime);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const encodedChecksum = checksum.toString(8).padStart(6, '0');
  writeString(header, 148, 8, `${encodedChecksum}\0 `);

  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

function createTarball(
  files: Record<string, string>,
  options: { mode: number; mtime: number }
): Buffer {
  const entries = Object.entries(files).map(([path, value]) =>
    tarEntry(path, Buffer.from(value, 'utf8'), options)
  );
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]), { mtime: options.mtime });
}

async function loadModule(): Promise<PackageTarballModule> {
  const url = new URL('../../scripts/package-tarball.mjs', import.meta.url);
  return (await import(url.href)) as PackageTarballModule;
}

describe('package tarball verification', () => {
  it('accepts identical files when archive metadata differs', async () => {
    const module = await loadModule();
    const first = createTarball(
      { 'package.json': '{"name":"demo"}\n', 'dist/index.js': 'export const ok = true;\n' },
      { mode: 0o644, mtime: 1_000 }
    );
    const second = createTarball(
      { 'package.json': '{"name":"demo"}\n', 'dist/index.js': 'export const ok = true;\n' },
      { mode: 0o600, mtime: 2_000 }
    );

    expect(() =>
      module.assertPackageContentsEqual(
        module.packageFileIndex(first),
        module.packageFileIndex(second)
      )
    ).not.toThrow();
  });

  it('rejects changed file contents', async () => {
    const module = await loadModule();
    const local = createTarball(
      { 'dist/index.js': 'export const value = 1;\n' },
      { mode: 0o644, mtime: 1 }
    );
    const registry = createTarball(
      { 'dist/index.js': 'export const value = 2;\n' },
      { mode: 0o644, mtime: 1 }
    );

    expect(() =>
      module.assertPackageContentsEqual(
        module.packageFileIndex(local),
        module.packageFileIndex(registry)
      )
    ).toThrow('package content mismatch for dist/index.js');
  });

  it('rejects missing or extra files', async () => {
    const module = await loadModule();
    const local = createTarball({ 'package.json': '{}\n' }, { mode: 0o644, mtime: 1 });
    const registry = createTarball(
      { 'package.json': '{}\n', 'README.md': '# Demo\n' },
      { mode: 0o644, mtime: 1 }
    );

    expect(() =>
      module.assertPackageContentsEqual(
        module.packageFileIndex(local),
        module.packageFileIndex(registry)
      )
    ).toThrow('registry package has unexpected file README.md');
  });

  it('computes the declared sha512 integrity format', async () => {
    const module = await loadModule();

    expect(module.integrityForBuffer(Buffer.from('release'), 'sha512-placeholder')).toBe(
      'sha512-aUwkxCn5v281jvDQwnaypTR1xNMDOjOBP4872VOCqzHgxI3uQH+OY+r4fyKyR0rMJ7NxkAPq1vI8ucZ6+OaDlg=='
    );
  });
});
