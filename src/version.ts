import fs from 'node:fs';

function resolveVersion(): string {
  try {
    const packageJsonUrl = new URL('../package.json', import.meta.url);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonUrl, 'utf8')) as {
      version?: string;
    };

    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const MONITOR_NAME = 'mcp-health-monitor';
export const MONITOR_VERSION = resolveVersion();
