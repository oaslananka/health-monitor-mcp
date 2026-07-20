import { toolError } from '../../src/tool-errors.js';

describe('toolError', () => {
  it('creates a stable non-retryable remediation envelope by default', () => {
    expect(
      toolError(
        'SERVER_NOT_FOUND',
        'Server is not registered: missing',
        'Run register_server first, then retry the operation.'
      )
    ).toEqual({
      ok: false,
      error: {
        code: 'SERVER_NOT_FOUND',
        message: 'Server is not registered: missing',
        remediation: 'Run register_server first, then retry the operation.',
        retryable: false
      }
    });
  });

  it('preserves an explicit retryable value', () => {
    expect(
      toolError('NO_SERVERS_REGISTERED', 'No servers', 'Register one.', true).error.retryable
    ).toBe(true);
  });
});
