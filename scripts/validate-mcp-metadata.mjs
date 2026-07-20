import fs from 'node:fs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function fail(errors) {
  for (const error of errors) {
    console.error(`metadata: ${error}`);
  }
  process.exit(1);
}

const packageJson = readJson('package.json');
const mcpJson = readJson('mcp.json');
const serverJson = readJson('server.json');
const releaseManifest = readJson('.release-please-manifest.json');
const pluginJson = readJson('.claude-plugin/plugin.json');
const errors = [];

if (packageJson.name !== 'health-monitor-mcp') {
  errors.push(`package name mismatch: ${packageJson.name}`);
}

if (packageJson.version !== mcpJson.version) {
  errors.push(`mcp.json version ${mcpJson.version} does not match package ${packageJson.version}`);
}

if (packageJson.version !== serverJson.version) {
  errors.push(
    `server.json version ${serverJson.version} does not match package ${packageJson.version}`
  );
}

if (releaseManifest['.'] !== packageJson.version) {
  errors.push(
    `.release-please-manifest.json version ${releaseManifest['.']} does not match package ${packageJson.version}`
  );
}

if (pluginJson.version !== packageJson.version) {
  errors.push(`plugin version ${pluginJson.version} does not match package ${packageJson.version}`);
}

if (pluginJson.name !== packageJson.name) {
  errors.push(`plugin name ${pluginJson.name} does not match package ${packageJson.name}`);
}

if (packageJson.mcpName !== mcpJson.mcpName) {
  errors.push(`mcpName mismatch between package.json and mcp.json`);
}

if (packageJson.mcpName !== serverJson.name) {
  errors.push(
    `server.json name ${serverJson.name} does not match package mcpName ${packageJson.mcpName}`
  );
}

if (serverJson.packages?.[0]?.identifier !== packageJson.name) {
  errors.push('server.json npm package identifier does not match package name');
}

if (serverJson.packages?.[0]?.version !== packageJson.version) {
  errors.push('server.json npm package version does not match package version');
}

if (serverJson.packages?.[0]?.transport?.type !== 'stdio') {
  errors.push('server.json package transport must remain stdio for the local package surface');
}

if (!serverJson.$schema?.startsWith('https://static.modelcontextprotocol.io/schemas/')) {
  errors.push('server.json must declare the official MCP Registry schema URL');
}

if (errors.length) {
  fail(errors);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      package: packageJson.name,
      version: packageJson.version,
      mcpName: packageJson.mcpName
    },
    null,
    2
  )
);
