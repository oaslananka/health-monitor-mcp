import { jest } from '@jest/globals';

import { log } from '../../src/logging.js';

describe('logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts secrets and serializes errors for info logs', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    log('info', 'Testing info log', {
      token: 'secret-value',
      password: 'top-secret',
      nested: {
        authorization: 'Bearer token',
        items: [{ secret: 'hidden' }]
      },
      error: new Error('boom')
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
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
