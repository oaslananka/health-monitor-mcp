import { RegisterServerSchema } from '../../src/types.js';

describe('input schemas', () => {
  it('requires URLs for http and sse servers', () => {
    expect(
      RegisterServerSchema.safeParse({
        name: 'http-server',
        type: 'http',
        tags: [],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: []
      }).success
    ).toBe(false);

    expect(
      RegisterServerSchema.safeParse({
        name: 'sse-server',
        type: 'sse',
        url: 'https://example.com/sse',
        tags: [],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: []
      }).success
    ).toBe(true);
  });

  it('requires a command for stdio servers', () => {
    expect(
      RegisterServerSchema.safeParse({
        name: 'stdio-server',
        type: 'stdio',
        tags: [],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: []
      }).success
    ).toBe(false);

    expect(
      RegisterServerSchema.safeParse({
        name: 'stdio-server',
        type: 'stdio',
        command: 'node',
        tags: [],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: ['server.js']
      }).success
    ).toBe(true);
  });

  it('rejects unsafe URL protocols and malformed rendering fields', () => {
    for (const url of [
      'file:///etc/passwd',
      'data:text/plain,hello',
      'javascript:alert(1)',
      'https://example.com/\nheader'
    ]) {
      expect(
        RegisterServerSchema.safeParse({
          name: 'bad-url',
          type: 'http',
          url,
          tags: [],
          alert_on_down: true,
          check_interval_minutes: 5,
          args: []
        }).success
      ).toBe(false);
    }

    expect(
      RegisterServerSchema.safeParse({
        name: 'bad|name',
        type: 'http',
        url: 'https://example.com/mcp',
        tags: [],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: []
      }).success
    ).toBe(false);

    expect(
      RegisterServerSchema.safeParse({
        name: 'good-name',
        type: 'http',
        url: 'https://example.com/mcp',
        tags: ['bad|tag'],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: []
      }).success
    ).toBe(false);
  });
});
