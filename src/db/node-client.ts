/// <reference types="node" />
// Node (better-sqlite3) twin of `@/db/client`, used by Jest. jest.config.js maps `@/db/client` to
// this file, so code under test (DbGate, the benchmark screen) runs real migrations in Node.
// Never import this from app code: better-sqlite3 is a dev dependency.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import * as schema from './schema';
import type { TaskBuddyDb } from './types';

export const DATABASE_NAME = 'taskbuddy.db';
export const BENCHMARK_DATABASE_NAME = 'benchmark.db';
export const MIGRATIONS_FOLDER = resolve(__dirname, '..', '..', 'drizzle');

export type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };

export type NodeDb = {
  db: TaskBuddyDb;
  sqlite: Database.Database;
  close: () => void;
};

/** Opens a SQLite DB with the same pragmas as the app (WAL, foreign keys on). */
export function openNodeDb(filename = ':memory:'): NodeDb {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
  const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

/**
 * Applies pending migrations with Drizzle's own migrator. With `count`, only the first `count`
 * journal entries are visible, which simulates an older app build (used by the AC2 harness).
 */
export function migrateNodeDb(
  db: TaskBuddyDb,
  options: { count?: number; folder?: string } = {},
): void {
  const folder = options.folder ?? MIGRATIONS_FOLDER;
  // drizzle() from better-sqlite3 returns a BetterSQLite3Database; TaskBuddyDb is its base type.
  const nodeDb = db as Parameters<typeof migrate>[0];
  if (options.count === undefined) {
    migrate(nodeDb, { migrationsFolder: folder });
    return;
  }
  const entries = readJournal(folder).slice(0, options.count);
  const partial = mkdtempSync(join(tmpdir(), 'tb-migrations-'));
  try {
    mkdirSync(join(partial, 'meta'));
    const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
      entries: JournalEntry[];
    };
    writeFileSync(
      join(partial, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries }, null, 2),
    );
    for (const entry of entries) {
      copyFileSync(join(folder, `${entry.tag}.sql`), join(partial, `${entry.tag}.sql`));
    }
    migrate(nodeDb, { migrationsFolder: partial });
  } finally {
    rmSync(partial, { recursive: true, force: true });
  }
}

// --- Same surface as `@/db/client` (the Jest stand-in for the app client) ---

let appDb: NodeDb | undefined;

export function getDb(): TaskBuddyDb {
  appDb ??= openNodeDb();
  return appDb.db;
}

export async function migrateDb(db: TaskBuddyDb): Promise<void> {
  migrateNodeDb(db);
}

export function openBenchmarkDb(): { db: TaskBuddyDb; close: () => void } {
  const handle = openNodeDb();
  return { db: handle.db, close: handle.close };
}

/** Test-only: drop the shared app DB so the next getDb() starts empty. */
export function resetDbForTests(): void {
  appDb?.close();
  appDb = undefined;
}
