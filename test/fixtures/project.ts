import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_ENCODING: BufferEncoding = 'utf8';
const PARENT_PATH_SEGMENT = '..';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export type PackageScriptExpectation = {
  scriptName: string;
  requiredCommands: string[];
};

export function createPackageScriptExpectation(
  scriptName: string,
  requiredCommands: string[]
): PackageScriptExpectation {
  return { scriptName, requiredCommands };
}

export function readProjectText(relativePath: string): string {
  return readFileSync(resolveProjectPath(relativePath), TEXT_ENCODING);
}

export function readProjectJson<T>(relativePath: string): T {
  return JSON.parse(readProjectText(relativePath)) as T;
}

function resolveProjectPath(relativePath: string): string {
  const resolvedPath = resolve(PROJECT_ROOT, relativePath);
  const relativeToRoot = relative(PROJECT_ROOT, resolvedPath);
  const exitsProjectRoot =
    relativeToRoot === PARENT_PATH_SEGMENT ||
    relativeToRoot.startsWith(`${PARENT_PATH_SEGMENT}${sep}`) ||
    isAbsolute(relativeToRoot);

  if (exitsProjectRoot || relativePath.includes(':')) {
    throw new Error(`Project fixture path must stay inside the repository: ${relativePath}`);
  }

  return resolvedPath;
}
