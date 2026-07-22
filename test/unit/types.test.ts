import {
  RegisterGitHubActionsSchema,
  RegisterGitLabPipelineSchema,
  RegisterServerSchema
} from '../../src/types.js';

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

  it('validates GitLab pipeline registration and normalizes GitLab.com defaults', () => {
    expect(
      RegisterGitLabPipelineSchema.parse({
        name: 'gitlab-ci',
        project: 'group/subgroup/project',
        ref: 'main',
        tags: ['production']
      })
    ).toEqual(
      expect.objectContaining({
        base_url: 'https://gitlab.com',
        project: 'group/subgroup/project',
        ref: 'main',
        token_env: 'GITLAB_TOKEN',
        check_interval_minutes: 5
      })
    );

    expect(
      RegisterGitLabPipelineSchema.parse({
        name: 'self-hosted',
        base_url: 'https://gitlab.example.com/',
        project: '123',
        tags: []
      }).base_url
    ).toBe('https://gitlab.example.com');

    for (const invalid of [
      { base_url: 'http://gitlab.example.com' },
      { base_url: 'https://user:pass@gitlab.example.com' },
      { base_url: 'https://gitlab.example.com/api/v4' },
      { base_url: 'https://gitlab.example.com?x=1' },
      { base_url: 'https://gitlab.example.com/#fragment' },
      { project: '../project' },
      { project: 'group//project' },
      { project: 'group project' },
      {
        ref: `bad
ref`
      },
      { token_env: 'gitlab-token' },
      { check_interval_minutes: 0 },
      { check_interval_minutes: 61 }
    ]) {
      expect(
        RegisterGitLabPipelineSchema.safeParse({
          name: 'gitlab-ci',
          base_url: 'https://gitlab.com',
          project: 'group/project',
          token_env: 'GITLAB_TOKEN',
          tags: [],
          check_interval_minutes: 5,
          ...invalid
        }).success
      ).toBe(false);
    }
  });
});
