import type Database from 'better-sqlite3';

type Migration = {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
};

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'initial schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
          name TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          url TEXT,
          command TEXT,
          args TEXT DEFAULT '[]',
          tags TEXT DEFAULT '[]',
          alert_on_down INTEGER DEFAULT 1,
          check_interval_minutes INTEGER DEFAULT 5,
          created_at INTEGER NOT NULL,
          last_checked INTEGER,
          last_status TEXT DEFAULT 'unknown',
          last_response_time_ms INTEGER,
          consecutive_failures INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS health_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          status TEXT NOT NULL,
          response_time_ms INTEGER,
          tool_count INTEGER,
          error_message TEXT,
          tools_snapshot TEXT,
          FOREIGN KEY (server_name) REFERENCES servers(name) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS alerts (
          server_name TEXT PRIMARY KEY,
          max_response_time_ms INTEGER,
          min_uptime_percent REAL,
          consecutive_failures_before_alert INTEGER DEFAULT 3,
          FOREIGN KEY (server_name) REFERENCES servers(name) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS azure_pipelines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_name TEXT NOT NULL,
          organization TEXT NOT NULL,
          project TEXT NOT NULL,
          pipeline_name TEXT NOT NULL,
          pipeline_id INTEGER,
          pat_token_encrypted TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(group_name, pipeline_name)
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_name TEXT NOT NULL,
          pipeline_name TEXT NOT NULL,
          build_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          result TEXT,
          build_number TEXT,
          start_time TEXT,
          finish_time TEXT,
          recorded_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_health_server_time
          ON health_checks(server_name, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_health_timestamp
          ON health_checks(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_group_time
          ON pipeline_runs(group_name, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_build
          ON pipeline_runs(build_id DESC);
      `);
    }
  },
  {
    version: 2,
    description: 'add response time analytics support',
    up: (db) => {
      addColumnIfMissing(db, 'servers', 'response_time_updated_at', 'INTEGER');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_health_server_time_response
          ON health_checks(server_name, timestamp DESC, response_time_ms);
      `);
    }
  },
  {
    version: 3,
    description: 'dedupe pipeline runs by stable build key',
    up: (db) => {
      db.exec(`
        DELETE FROM pipeline_runs
        WHERE id NOT IN (
          SELECT MAX(id)
          FROM pipeline_runs
          GROUP BY group_name, pipeline_name, build_id
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_runs_stable_key
          ON pipeline_runs(group_name, pipeline_name, build_id);
      `);
    }
  },
  {
    version: 4,
    description: 'remove retired Azure DevOps monitoring data',
    up: (db) => {
      db.exec(`
        DROP INDEX IF EXISTS idx_pipeline_runs_group_time;
        DROP INDEX IF EXISTS idx_pipeline_runs_build;
        DROP INDEX IF EXISTS idx_pipeline_runs_stable_key;
        DROP TABLE IF EXISTS pipeline_runs;
        DROP TABLE IF EXISTS azure_pipelines;
      `);
    }
  },
  {
    version: 5,
    description: 'add GitHub Actions monitoring provider',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_actions_targets (
          name TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          repository TEXT NOT NULL,
          workflow TEXT NOT NULL,
          branch TEXT,
          token_env TEXT NOT NULL DEFAULT 'GITHUB_TOKEN',
          tags TEXT NOT NULL DEFAULT '[]',
          check_interval_minutes INTEGER NOT NULL DEFAULT 5,
          created_at INTEGER NOT NULL,
          last_checked INTEGER,
          last_status TEXT NOT NULL DEFAULT 'unknown',
          last_response_time_ms INTEGER,
          last_run_id INTEGER,
          last_conclusion TEXT,
          last_run_url TEXT,
          consecutive_failures INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS github_actions_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          status TEXT NOT NULL,
          response_time_ms INTEGER,
          run_id INTEGER,
          workflow_name TEXT,
          run_number INTEGER,
          run_attempt INTEGER,
          run_status TEXT,
          conclusion TEXT,
          event TEXT,
          branch TEXT,
          commit_sha TEXT,
          run_url TEXT,
          error_message TEXT,
          failed_jobs TEXT,
          FOREIGN KEY (target_name) REFERENCES github_actions_targets(name) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_github_actions_checks_target_time
          ON github_actions_checks(target_name, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_github_actions_checks_timestamp
          ON github_actions_checks(timestamp DESC);
      `);
    }
  },
  {
    version: 6,
    description: 'add GitLab pipeline monitoring provider',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gitlab_pipeline_targets (
          name TEXT PRIMARY KEY,
          base_url TEXT NOT NULL,
          project_path TEXT NOT NULL,
          ref TEXT,
          token_env TEXT NOT NULL DEFAULT 'GITLAB_TOKEN',
          tags TEXT NOT NULL DEFAULT '[]',
          check_interval_minutes INTEGER NOT NULL DEFAULT 5,
          created_at INTEGER NOT NULL,
          last_checked INTEGER,
          last_status TEXT NOT NULL DEFAULT 'unknown',
          last_response_time_ms INTEGER,
          last_pipeline_id INTEGER,
          last_pipeline_status TEXT,
          last_pipeline_url TEXT,
          consecutive_failures INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS gitlab_pipeline_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          status TEXT NOT NULL,
          response_time_ms INTEGER,
          pipeline_id INTEGER,
          pipeline_iid INTEGER,
          pipeline_status TEXT,
          ref TEXT,
          commit_sha TEXT,
          source TEXT,
          pipeline_url TEXT,
          error_message TEXT,
          failed_jobs TEXT,
          FOREIGN KEY (target_name) REFERENCES gitlab_pipeline_targets(name) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_gitlab_pipeline_checks_target_time
          ON gitlab_pipeline_checks(target_name, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_gitlab_pipeline_checks_timestamp
          ON gitlab_pipeline_checks(timestamp DESC);
      `);
    }
  }
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const appliedVersions = new Set(
    (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as Array<{
        version: number;
      }>
    ).map((row) => row.version)
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        `
          INSERT INTO schema_migrations (version, description, applied_at)
          VALUES (?, ?, ?)
        `
      ).run(migration.version, migration.description, Date.now());
    });

    apply();
  }
}
