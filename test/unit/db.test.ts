import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getDb, getResolvedDbPath, resetDbForTests } from '../../src/db.js';

describe('db', () => {
  const originalDb = process.env.HEALTH_MONITOR_DB;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'health-monitor-db-'));
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_DB;
  });

  afterEach(() => {
    resetDbForTests();
    if (originalDb === undefined) {
      delete process.env.HEALTH_MONITOR_DB;
    } else {
      process.env.HEALTH_MONITOR_DB = originalDb;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('resolves the default home database path when no override is set', () => {
    expect(getResolvedDbPath()).toBe(path.join(os.homedir(), '.mcp-health-monitor', 'health.db'));
  });

  it('reuses the cached in-memory database for the same path', () => {
    process.env.HEALTH_MONITOR_DB = ':memory:';

    const first = getDb();
    const second = getDb();

    expect(second).toBe(first);
    expect(first.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('creates parent directories and switches cached databases when the path changes', () => {
    const firstPath = path.join(tempRoot, 'one', 'health.db');
    const secondPath = path.join(tempRoot, 'two', 'health.db');

    process.env.HEALTH_MONITOR_DB = firstPath;
    const first = getDb();
    first.exec('CREATE TABLE IF NOT EXISTS smoke (id INTEGER PRIMARY KEY)');

    process.env.HEALTH_MONITOR_DB = secondPath;
    const second = getDb();

    expect(second).not.toBe(first);
    expect(fs.existsSync(path.dirname(firstPath))).toBe(true);
    expect(fs.existsSync(path.dirname(secondPath))).toBe(true);
    expect(second.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('allows reset without an active database', () => {
    expect(() => resetDbForTests()).not.toThrow();
  });
});
