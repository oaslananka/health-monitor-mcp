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
      { version: 4, description: 'remove retired Azure DevOps monitoring data' }
    ]);
    expect(columns.map((column) => column.name)).toContain('response_time_updated_at');
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

    expect(count).toBe(4);
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
});
