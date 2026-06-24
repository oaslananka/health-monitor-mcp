import {
  createRuntimePolicy,
  STDIO_COMMAND_NOT_ALLOWED_MESSAGE,
  STDIO_COMMAND_UNSAFE_MESSAGE,
  validateStdioCommandPolicy
} from '../../src/policy.js';

describe('runtime policy', () => {
  beforeEach(() => {
    delete process.env.HEALTH_MONITOR_ALLOW_STDIO;
    delete process.env.HEALTH_MONITOR_PROFILE;
    delete process.env.HEALTH_MONITOR_STDIO_ALLOWLIST;
  });

  afterAll(() => {
    delete process.env.HEALTH_MONITOR_ALLOW_STDIO;
    delete process.env.HEALTH_MONITOR_PROFILE;
    delete process.env.HEALTH_MONITOR_STDIO_ALLOWLIST;
  });

  it('requires explicit stdio opt-in outside tests and embedded policy overrides', () => {
    expect(createRuntimePolicy({ transport: 'stdio' }).allowStdio).toBe(false);

    process.env.HEALTH_MONITOR_ALLOW_STDIO = '1';
    expect(createRuntimePolicy({ transport: 'stdio' }).allowStdio).toBe(true);

    expect(createRuntimePolicy({ transport: 'stdio', allowStdio: true }).allowStdio).toBe(true);
  });

  it('keeps remote-safe profiles stdio-disabled even when opt-in is present', () => {
    process.env.HEALTH_MONITOR_ALLOW_STDIO = '1';

    expect(createRuntimePolicy({ profile: 'remote-safe', transport: 'stdio' }).allowStdio).toBe(
      false
    );
    expect(createRuntimePolicy({ profile: 'chatgpt', transport: 'stdio' }).allowStdio).toBe(false);
    expect(createRuntimePolicy({ profile: 'claude', transport: 'stdio' }).allowStdio).toBe(false);
  });

  it('rejects compound stdio commands and supports exact command allowlists', () => {
    expect(() => validateStdioCommandPolicy('npx mcp-debug-recorder')).toThrow(
      STDIO_COMMAND_UNSAFE_MESSAGE
    );
    expect(() => validateStdioCommandPolicy('node')).not.toThrow();

    process.env.HEALTH_MONITOR_STDIO_ALLOWLIST = 'node,/usr/local/bin/npx';
    expect(() => validateStdioCommandPolicy('python')).toThrow(STDIO_COMMAND_NOT_ALLOWED_MESSAGE);
    expect(() => validateStdioCommandPolicy('node')).not.toThrow();
    expect(() => validateStdioCommandPolicy('/usr/local/bin/npx')).not.toThrow();
  });
});
