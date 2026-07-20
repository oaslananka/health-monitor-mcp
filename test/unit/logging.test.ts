import { jest } from '@jest/globals';

import { log } from '../../src/logging.js';

describe('logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts secrets and writes info logs to stderr without using stdout', () => {
    const stdoutSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    log('info', 'Testing info log', {
      token: 'secret-value',
      password: 'top-secret',
      nested: {
        authorization: 'Bearer token',
        items: [{ secret: 'hidden' }]
      },
      error: new Error('boom')
    });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(stderrSpy.mock.calls[0]?.[0])) as {
      level: string;
      message: string;
      context: Record<string, unknown>;
    };

    expect(payload.level).toBe('info');
    expect(payload.message).toBe('Testing info log');
    expect(payload.context).toEqual({
      token: '[redacted]',
      password: '[redacted]',
      nested: {
        authorization: '[redacted]',
        items: [{ secret: '[redacted]' }]
      },
      error: {
        name: 'Error',
        message: 'boom'
      }
    });
  });

  it('writes debug logs to stderr without using stdout', () => {
    const stdoutSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    log('debug', 'Debug log', { component: 'scheduler' });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('"level":"debug"');
  });

  it('uses console.warn for warn logs', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    log('warn', 'Warning log');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('"level":"warn"');
  });

  it('uses console.error for error logs', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    log('error', 'Error log');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('"level":"error"');
  });
});
