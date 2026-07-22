process.env.HEALTH_MONITOR_DB = ':memory:';

import { getDb, resetDbForTests } from '../../src/db.js';
import { runMigrations } from '../../src/migrations.js';

describe('migrations', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('creates schema_migrations entries and expected analytics structures', () => {
    const db = getDb();
    const migrations = db
      .prepare('SELECT version, description FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number; description: string }>;
    const columns = db.prepare('PRAGMA table_info(servers)').all() as Array<{ name: string }>;

    expect(migrations).toEqual([
      { version: 1, description: 'initial schema' },
      { version: 2, description: 'add response time analytics support' },
      { version: 3, description: 'dedupe pipeline runs by stable build key' },
      { version: 4, description: 'remove retired Azure DevOps monitoring data' },
      { version: 5, description: 'add GitHub Actions monitoring provider' },
      { version: 6, description: 'add GitLab pipeline monitoring provider' }
    ]);
    expect(columns.map((column) => column.name)).toContain('response_time_updated_at');

    const githubTargetColumns = db
      .prepare('PRAGMA table_info(github_actions_targets)')
      .all() as Array<{ name: string }>;
    const githubCheckColumns = db
      .prepare('PRAGMA table_info(github_actions_checks)')
      .all() as Array<{ name: string }>;
    expect(githubTargetColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'name',
        'owner',
        'repository',
        'workflow',
        'token_env',
        'last_run_id'
      ])
    );
    expect(githubCheckColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['target_name', 'run_id', 'commit_sha', 'failed_jobs'])
    );

    const gitlabTargetColumns = db
      .prepare('PRAGMA table_info(gitlab_pipeline_targets)')
      .all() as Array<{ name: string }>;
    const gitlabCheckColumns = db
      .prepare('PRAGMA table_info(gitlab_pipeline_checks)')
      .all() as Array<{ name: string }>;
    expect(gitlabTargetColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'name',
        'base_url',
        'project_path',
        'token_env',
        'last_pipeline_id',
        'last_pipeline_status'
      ])
    );
    expect(gitlabCheckColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['target_name', 'pipeline_id', 'commit_sha', 'failed_jobs'])
    );
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).not.toEqual(
      expect.arrayContaining(['azure_pipelines', 'pipeline_runs'])
    );
  });

  it('is idempotent when rerun on the same database', () => {
    const db = getDb();

    runMigrations(db);
    runMigrations(db);

    const count = (
      db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
        count: number;
      }
    ).count;

    expect(count).toBe(6);
  });

  it('removes retired Azure tables during an upgrade while preserving monitor data', () => {
    const db = getDb();
    db.exec(`
      DELETE FROM schema_migrations WHERE version = 4;
    `);

    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).not.toEqual(
      expect.arrayContaining(['azure_pipelines', 'pipeline_runs'])
    );
    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining(['servers', 'health_checks', 'alerts'])
    );
  });

  it('cascades GitHub Actions check history when a target is removed', () => {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO github_actions_targets (
        name, owner, repository, workflow, token_env, tags,
        check_interval_minutes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run('repo-ci', 'oaslananka', 'health-monitor-mcp', 'ci.yml', 'GITHUB_TOKEN', '[]', 5, 1);
    db.prepare(
      `
      INSERT INTO github_actions_checks (target_name, timestamp, status)
      VALUES (?, ?, ?)
    `
    ).run('repo-ci', 2, 'up');

    db.prepare('DELETE FROM github_actions_targets WHERE name = ?').run('repo-ci');

    const count = db.prepare('SELECT COUNT(*) AS count FROM github_actions_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(0);
  });

  it('cascades GitLab pipeline check history when a target is removed', () => {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO gitlab_pipeline_targets (
        name, base_url, project_path, token_env, tags,
        check_interval_minutes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run('gitlab-ci', 'https://gitlab.com', 'group/project', 'GITLAB_TOKEN', '[]', 5, 1);
    db.prepare(
      `
      INSERT INTO gitlab_pipeline_checks (target_name, timestamp, status)
      VALUES (?, ?, ?)
    `
    ).run('gitlab-ci', 2, 'up');

    db.prepare('DELETE FROM gitlab_pipeline_targets WHERE name = ?').run('gitlab-ci');

    const count = db.prepare('SELECT COUNT(*) AS count FROM gitlab_pipeline_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(0);
  });
});
