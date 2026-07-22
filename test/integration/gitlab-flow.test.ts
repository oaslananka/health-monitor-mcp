process.env.HEALTH_MONITOR_DB = ':memory:';

import { jest } from '@jest/globals';

import { registerMonitoringTools } from '../../src/app.js';
import { resetDbForTests } from '../../src/db.js';
import {
  resetGitLabPipelineRuntimeForTests,
  setGitLabPipelineRuntimeForTests
} from '../../src/gitlab-pipelines.js';

type ToolResponse = { content: Array<{ text: string }> };
type ToolHandler = (input: unknown) => Promise<ToolResponse>;

function toolMap(): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  registerMonitoringTools({
    registerTool(name: string, _config: unknown, handler: unknown) {
      tools.set(name, handler as ToolHandler);
      return {};
    }
  });
  return tools;
}

function parse(response: ToolResponse): Record<string, unknown> {
  return JSON.parse(response.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('GitLab pipeline integration flow', () => {
  beforeEach(() => {
    resetDbForTests();
    resetGitLabPipelineRuntimeForTests();
    delete process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST;
  });

  afterAll(() => {
    resetDbForTests();
    resetGitLabPipelineRuntimeForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST;
  });

  it('registers, checks, lists, reports, and removes a GitLab pipeline target', async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 900,
              iid: 45,
              status: 'success',
              source: 'push',
              ref: 'main',
              sha: 'abc123',
              web_url: 'https://gitlab.com/group/project/-/pipelines/900',
              created_at: '2026-07-22T10:00:00Z',
              updated_at: '2026-07-22T10:05:00Z'
            }
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    ) as unknown as typeof fetch;
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const tools = toolMap();
    const register = tools.get('register_gitlab_pipeline');
    const check = tools.get('check_gitlab_pipeline');
    const list = tools.get('list_gitlab_pipelines');
    const dashboard = tools.get('get_dashboard');
    const report = tools.get('get_report');
    const remove = tools.get('unregister_gitlab_pipeline');

    if (!register || !check || !list || !dashboard || !report || !remove) {
      throw new Error('Expected GitLab integration tools were not registered');
    }

    expect(
      parse(
        await register({
          name: 'gitlab-ci',
          base_url: 'https://gitlab.com',
          project: 'group/project',
          ref: 'main',
          token_env: 'GITLAB_TOKEN',
          tags: ['integration'],
          check_interval_minutes: 5
        })
      )
    ).toEqual(expect.objectContaining({ registered: true, name: 'gitlab-ci' }));

    expect(parse(await check({ name: 'gitlab-ci', timeout_ms: 5_000 }))).toEqual(
      expect.objectContaining({
        status: 'up',
        pipeline: expect.objectContaining({ id: 900, commit_sha: 'abc123' })
      })
    );
    expect(parse(await list({ tags: ['integration'] }))).toEqual(
      expect.objectContaining({ count: 1 })
    );
    expect(parse(await dashboard({ hours: 24, include_tool_stats: true }))).toEqual(
      expect.objectContaining({
        gitlab_pipelines: [expect.objectContaining({ name: 'gitlab-ci' })]
      })
    );
    expect((await report({ hours: 24 })).content[0]?.text).toContain('## GitLab Pipelines');
    expect(parse(await remove({ name: 'gitlab-ci' }))).toEqual(
      expect.objectContaining({ unregistered: true, name: 'gitlab-ci' })
    );
  });
});
