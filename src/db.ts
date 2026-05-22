import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { runMigrations } from './migrations.js';

const DEFAULT_DB_PATH = path.join(os.homedir(), '.mcp-health-monitor', 'health.db');

let cachedDb: Database.Database | null = null;
let cachedDbPath: string | null = null;

function resolveDbPath(): string {
  return process.env.HEALTH_MONITOR_DB?.trim() || DEFAULT_DB_PATH;
}

export function getDb(): Database.Database {
  const dbPath = resolveDbPath();

  if (cachedDb && cachedDbPath === dbPath) {
    return cachedDb;
  }

  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
    cachedDbPath = null;
  }

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  runMigrations(db);

  cachedDb = db;
  cachedDbPath = dbPath;
  return db;
}

export function resetDbForTests(): void {
  if (cachedDb) {
    cachedDb.close();
  }

  cachedDb = null;
  cachedDbPath = null;
}

export function getResolvedDbPath(): string {
  return resolveDbPath();
}
