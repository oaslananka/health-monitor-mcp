process.env.HEALTH_MONITOR_DB = ':memory:';

import { getDb, resetDbForTests } from '../../src/db.js';
import {
  getGitLabPipelineDashboardReport,
  getGitLabPipelineTarget,
  getLatestGitLabPipelineCheck,
  listGitLabPipelineTargets,
  pruneGitLabPipelineChecks,
  recordGitLabPipelineCheck,
  registerGitLabPipelineTarget,
  unregisterGitLabPipelineTarget
} from '../../src/gitlab-pipeline-registry.js';
import type {
  GitLabPipelineCheckResult,
  GitLabPipelineDetails,
  RegisterGitLabPipelineInput
} from '../../src/types.js';

function registration(
  overrides: Partial<RegisterGitLabPipelineInput> = {}
): RegisterGitLabPipelineInput {
  return {
    name: 'gitlab-ci',
    base_url: 'https://gitlab.com',
    project: 'group/project',
    ref: 'main',
    token_env: 'GITLAB_TOKEN',
    tags: ['production'],
    check_interval_minutes: 5,
    ...overrides
  };
}

function pipeline(overrides: Partial<GitLabPipelineDetails> = {}): GitLabPipelineDetails {
  return {
    id: 900,
    iid: 45,
    status: 'success',
    ref: 'main',
    commit_sha: 'abc123',
    source: 'push',
    url: 'https://gitlab.com/group/project/-/pipelines/900',
    created_at: '2026-07-22T10:00:00Z',
    updated_at: '2026-07-22T10:05:00Z',
    ...overrides
  };
}

function check(
  status: GitLabPipelineCheckResult['status'],
  overrides: Partial<GitLabPipelineCheckResult> = {}
): GitLabPipelineCheckResult {
  return {
    status,
    response_time_ms: 50,
    error_message: status === 'up' ? null : `${status} result`,
    pipeline: pipeline({ status: status === 'up' ? 'success' : 'failed' }),
    failed_jobs: [],
    ...overrides
  };
}

describe('GitLab pipeline registry', () => {
  beforeEach(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_RETENTION_DAYS;
  });

  afterAll(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_RETENTION_DAYS;
  });

  it('registers, updates, lists, filters, and removes targets without storing tokens', () => {
    expect(registerGitLabPipelineTarget(registration())).toEqual({
      registered: true,
      name: 'gitlab-ci'
    });

    const first = getGitLabPipelineTarget('gitlab-ci');
    expect(first).toEqual(
      expect.objectContaining({
        base_url: 'https://gitlab.com',
        project: 'group/project',
        ref: 'main',
        token_env: 'GITLAB_TOKEN',
        tags: ['production'],
        last_status: 'unknown'
      })
    );
    expect(JSON.stringify(first)).not.toContain('glpat-');

    registerGitLabPipelineTarget(
      registration({
        base_url: 'https://gitlab.internal.example',
        project: '123',
        ref: 'release',
        tags: ['release'],
        check_interval_minutes: 10
      })
    );

    expect(getGitLabPipelineTarget('gitlab-ci')).toEqual(
      expect.objectContaining({
        base_url: 'https://gitlab.internal.example',
        project: '123',
        ref: 'release',
        tags: ['release'],
        check_interval_minutes: 10
      })
    );
    expect(listGitLabPipelineTargets({ tags: ['production'] })).toHaveLength(0);
    expect(listGitLabPipelineTargets({ tags: ['release'] })).toHaveLength(1);
    expect(listGitLabPipelineTargets({ status: 'unknown' })).toHaveLength(1);

    expect(unregisterGitLabPipelineTarget('gitlab-ci')).toEqual({
      unregistered: true,
      name: 'gitlab-ci'
    });
    expect(getGitLabPipelineTarget('gitlab-ci')).toBeNull();
  });

  it('records structured history and maintains consecutive failures', () => {
    registerGitLabPipelineTarget(registration());

    recordGitLabPipelineCheck(
      'gitlab-ci',
      check('down', {
        failed_jobs: [
          {
            id: 501,
            name: 'unit-tests',
            stage: 'test',
            status: 'failed',
            ref: 'main',
            commit_sha: 'abc123',
            url: 'https://gitlab.com/group/project/-/jobs/501',
            started_at: null,
            finished_at: null,
            trace_excerpt: 'Assertion failed',
            trace_error: null
          }
        ]
      }),
      1_000
    );
    recordGitLabPipelineCheck(
      'gitlab-ci',
      check('down', {
        pipeline: pipeline({ id: 901, iid: 46, status: 'canceled' })
      }),
      2_000
    );

    expect(getGitLabPipelineTarget('gitlab-ci')).toEqual(
      expect.objectContaining({
        last_status: 'down',
        last_pipeline_id: 901,
        last_pipeline_status: 'canceled',
        consecutive_failures: 2
      })
    );
    expect(getLatestGitLabPipelineCheck('gitlab-ci')).toEqual(
      expect.objectContaining({
        timestamp: 2_000,
        pipeline_id: 901,
        pipeline_iid: 46,
        failed_jobs: []
      })
    );

    recordGitLabPipelineCheck(
      'gitlab-ci',
      check('up', {
        pipeline: pipeline({ id: 902, iid: 47, status: 'success' })
      }),
      3_000
    );
    expect(getGitLabPipelineTarget('gitlab-ci')).toEqual(
      expect.objectContaining({ last_status: 'up', consecutive_failures: 0 })
    );
  });

  it('builds dashboard aggregates and prunes expired history', () => {
    process.env.HEALTH_MONITOR_RETENTION_DAYS = '1';
    registerGitLabPipelineTarget(registration());
    registerGitLabPipelineTarget(
      registration({ name: 'other-ci', project: 'other/project', ref: undefined })
    );

    const now = 3 * 24 * 60 * 60 * 1000;
    recordGitLabPipelineCheck('gitlab-ci', check('up', { response_time_ms: 40 }), now - 2_000);
    recordGitLabPipelineCheck('gitlab-ci', check('down', { response_time_ms: 80 }), now - 1_000);
    recordGitLabPipelineCheck('other-ci', check('up', { response_time_ms: 20 }), now - 3_000);
    getDb()
      .prepare(
        `INSERT INTO gitlab_pipeline_checks (target_name, timestamp, status) VALUES (?, ?, ?)`
      )
      .run('gitlab-ci', now - 2 * 24 * 60 * 60 * 1000, 'up');

    expect(getGitLabPipelineDashboardReport(24, now)).toEqual([
      expect.objectContaining({
        name: 'gitlab-ci',
        current_status: 'down',
        uptime_percent: 50,
        avg_response_time_ms: 60,
        total_checks: 2,
        latest_pipeline_status: 'failed'
      }),
      expect.objectContaining({
        name: 'other-ci',
        current_status: 'up',
        uptime_percent: 100,
        avg_response_time_ms: 20,
        total_checks: 1
      })
    ]);

    expect(pruneGitLabPipelineChecks(now)).toBe(1);
    const count = getDb().prepare('SELECT COUNT(*) AS count FROM gitlab_pipeline_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(3);
  });

  it('deletes provider history when the target is removed', () => {
    registerGitLabPipelineTarget(registration());
    recordGitLabPipelineCheck('gitlab-ci', check('up'), 1_000);

    unregisterGitLabPipelineTarget('gitlab-ci');

    const count = getDb().prepare('SELECT COUNT(*) AS count FROM gitlab_pipeline_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(0);
  });
});
