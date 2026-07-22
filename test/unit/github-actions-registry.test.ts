process.env.HEALTH_MONITOR_DB = ':memory:';

import { getDb, resetDbForTests } from '../../src/db.js';
import {
  getGitHubActionsDashboardReport,
  getGitHubActionsTarget,
  getLatestGitHubActionsCheck,
  listGitHubActionsTargets,
  pruneGitHubActionsChecks,
  recordGitHubActionsCheck,
  registerGitHubActionsTarget,
  unregisterGitHubActionsTarget
} from '../../src/github-actions-registry.js';
import type {
  GitHubActionsCheckResult,
  GitHubActionsRunDetails,
  RegisterGitHubActionsInput
} from '../../src/types.js';

function registration(
  overrides: Partial<RegisterGitHubActionsInput> = {}
): RegisterGitHubActionsInput {
  return {
    name: 'repo-ci',
    owner: 'oaslananka',
    repository: 'health-monitor-mcp',
    workflow: 'ci.yml',
    branch: 'main',
    token_env: 'GITHUB_TOKEN',
    tags: ['production'],
    check_interval_minutes: 5,
    ...overrides
  };
}

function run(overrides: Partial<GitHubActionsRunDetails> = {}): GitHubActionsRunDetails {
  return {
    id: 123,
    workflow_name: 'CI',
    run_number: 45,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    branch: 'main',
    commit_sha: 'abc123',
    url: 'https://github.com/oaslananka/health-monitor-mcp/actions/runs/123',
    created_at: '2026-07-22T10:00:00Z',
    updated_at: '2026-07-22T10:05:00Z',
    ...overrides
  };
}

function check(
  status: GitHubActionsCheckResult['status'],
  overrides: Partial<GitHubActionsCheckResult> = {}
): GitHubActionsCheckResult {
  return {
    status,
    response_time_ms: 50,
    error_message: status === 'up' ? null : `${status} result`,
    run: run({ conclusion: status === 'up' ? 'success' : 'failure' }),
    failed_jobs: [],
    ...overrides
  };
}

describe('GitHub Actions registry', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  afterAll(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_RETENTION_DAYS;
  });

  it('registers, updates, lists, filters, and removes targets without storing tokens', () => {
    expect(registerGitHubActionsTarget(registration())).toEqual({
      registered: true,
      name: 'repo-ci'
    });
    const first = getGitHubActionsTarget('repo-ci');

    expect(first).toEqual(
      expect.objectContaining({
        owner: 'oaslananka',
        repository: 'health-monitor-mcp',
        workflow: 'ci.yml',
        branch: 'main',
        token_env: 'GITHUB_TOKEN',
        tags: ['production'],
        last_status: 'unknown'
      })
    );
    expect(JSON.stringify(first)).not.toContain('github_pat_');

    registerGitHubActionsTarget(
      registration({ branch: 'release', tags: ['release'], check_interval_minutes: 10 })
    );
    expect(getGitHubActionsTarget('repo-ci')).toEqual(
      expect.objectContaining({ branch: 'release', tags: ['release'], check_interval_minutes: 10 })
    );
    expect(listGitHubActionsTargets({ tags: ['production'] })).toHaveLength(0);
    expect(listGitHubActionsTargets({ tags: ['release'] })).toHaveLength(1);
    expect(listGitHubActionsTargets({ status: 'unknown' })).toHaveLength(1);

    expect(unregisterGitHubActionsTarget('repo-ci')).toEqual({
      unregistered: true,
      name: 'repo-ci'
    });
    expect(getGitHubActionsTarget('repo-ci')).toBeNull();
  });

  it('records structured history and maintains consecutive failures', () => {
    registerGitHubActionsTarget(registration());

    recordGitHubActionsCheck(
      'repo-ci',
      check('down', {
        failed_jobs: [
          {
            name: 'test',
            url: 'https://github.com/example/job/1',
            status: 'completed',
            conclusion: 'failure',
            started_at: null,
            completed_at: null,
            failed_steps: [
              {
                number: 2,
                name: 'Run tests',
                status: 'completed',
                conclusion: 'failure',
                started_at: null,
                completed_at: null
              }
            ]
          }
        ]
      }),
      1_000
    );
    recordGitHubActionsCheck(
      'repo-ci',
      check('down', {
        run: run({ id: 124, run_number: 46, conclusion: 'failure' })
      }),
      2_000
    );

    expect(getGitHubActionsTarget('repo-ci')).toEqual(
      expect.objectContaining({
        last_status: 'down',
        last_run_id: 124,
        last_conclusion: 'failure',
        consecutive_failures: 2
      })
    );
    expect(getLatestGitHubActionsCheck('repo-ci')).toEqual(
      expect.objectContaining({
        timestamp: 2_000,
        run_id: 124,
        failed_jobs: []
      })
    );

    recordGitHubActionsCheck(
      'repo-ci',
      check('up', {
        run: run({ id: 125, run_number: 47, conclusion: 'success' })
      }),
      3_000
    );
    expect(getGitHubActionsTarget('repo-ci')).toEqual(
      expect.objectContaining({ last_status: 'up', consecutive_failures: 0 })
    );
  });

  it('builds dashboard aggregates and prunes expired history', () => {
    process.env.HEALTH_MONITOR_RETENTION_DAYS = '1';
    registerGitHubActionsTarget(registration());
    registerGitHubActionsTarget(registration({ name: 'other-ci', workflow: 'release.yml' }));

    const now = 3 * 24 * 60 * 60 * 1000;
    recordGitHubActionsCheck('repo-ci', check('up', { response_time_ms: 40 }), now - 2_000);
    recordGitHubActionsCheck('repo-ci', check('down', { response_time_ms: 80 }), now - 1_000);
    recordGitHubActionsCheck('other-ci', check('up', { response_time_ms: 20 }), now - 3_000);
    getDb()
      .prepare(
        `INSERT INTO github_actions_checks (target_name, timestamp, status) VALUES (?, ?, ?)`
      )
      .run('repo-ci', now - 2 * 24 * 60 * 60 * 1000, 'up');

    expect(getGitHubActionsDashboardReport(24, now)).toEqual([
      expect.objectContaining({
        name: 'other-ci',
        current_status: 'up',
        uptime_percent: 100,
        avg_response_time_ms: 20,
        total_checks: 1
      }),
      expect.objectContaining({
        name: 'repo-ci',
        current_status: 'down',
        uptime_percent: 50,
        avg_response_time_ms: 60,
        total_checks: 2,
        latest_conclusion: 'failure'
      })
    ]);

    expect(pruneGitHubActionsChecks(now)).toBe(1);
    const count = getDb().prepare('SELECT COUNT(*) AS count FROM github_actions_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(3);
  });

  it('deletes provider history when the target is removed', () => {
    registerGitHubActionsTarget(registration());
    recordGitHubActionsCheck('repo-ci', check('up'), 1_000);

    unregisterGitHubActionsTarget('repo-ci');

    const count = getDb().prepare('SELECT COUNT(*) AS count FROM github_actions_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(0);
  });
});
