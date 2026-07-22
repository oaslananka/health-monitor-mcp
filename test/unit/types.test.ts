import { RegisterGitHubActionsSchema, RegisterServerSchema } from '../../src/types.js';

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

  it('validates GitHub Actions registration fields without accepting secret values', () => {
    expect(
      RegisterGitHubActionsSchema.parse({
        name: 'repo-ci',
        owner: 'oaslananka',
        repository: 'health-monitor-mcp',
        workflow: 'ci.yml',
        token_env: 'GITHUB_TOKEN',
        tags: ['production'],
        check_interval_minutes: 5
      })
    ).toEqual(
      expect.objectContaining({
        workflow: 'ci.yml',
        token_env: 'GITHUB_TOKEN'
      })
    );

    expect(
      RegisterGitHubActionsSchema.safeParse({
        name: 'numeric-workflow',
        owner: 'oaslananka',
        repository: 'health-monitor-mcp',
        workflow: '123456',
        tags: []
      }).success
    ).toBe(true);

    for (const invalid of [
      { workflow: '../ci.yml' },
      { workflow: '.github/workflows/ci.yml' },
      { workflow: 'ci.txt' },
      { token_env: 'github-token' },
      { token_env: 'GITHUB TOKEN' },
      { owner: 'bad/owner' },
      { repository: 'bad/repository' },
      { branch: `bad\nbranch` },
      { check_interval_minutes: 0 },
      { check_interval_minutes: 61 }
    ]) {
      expect(
        RegisterGitHubActionsSchema.safeParse({
          name: 'repo-ci',
          owner: 'oaslananka',
          repository: 'health-monitor-mcp',
          workflow: 'ci.yml',
          token_env: 'GITHUB_TOKEN',
          tags: [],
          check_interval_minutes: 5,
          ...invalid
        }).success
      ).toBe(false);
    }
  });
});
