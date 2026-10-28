/// <reference types="node" />
// Node (better-sqlite3) twin of `@/db/client`, used by Jest. jest.config.js maps `@/db/client` to
// this file, so code under test (DbGate, the benchmark screen) runs real migrations in Node.
// Never import this from app code: better-sqlite3 is a dev dependency.
import Database from 'better-sqlite3';
import type { Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import * as schema from './schema';
import type { TaskBuddyDb } from './types';
import { LEGACY_DATABASE_NAME, resolveUserDb } from './user-db';

export const DATABASE_NAME = LEGACY_DATABASE_NAME;
export const BENCHMARK_DATABASE_NAME = 'benchmark.db';
export const MIGRATIONS_FOLDER = resolve(__dirname, '..', '..', 'drizzle');

export type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };

export type NodeDb = {
  db: TaskBuddyDb;
  sqlite: Database.Database;
  close: () => void;
};

/** Opens a SQLite DB with the same pragmas as the app (WAL, foreign keys on). */
export function openNodeDb(filename = ':memory:', options: { logger?: Logger } = {}): NodeDb {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema, logger: options.logger });
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

// Named in-memory databases stand in for the device's files (one per name, like the app).
const openDbs = new Map<string, NodeDb>();
let userDb: TaskBuddyDb | undefined;

function openNamed(name: string): TaskBuddyDb {
  let handle = openDbs.get(name);
  if (!handle) {
    handle = openNodeDb();
    openDbs.set(name, handle);
  }
  return handle.db;
}

export function getDb(): TaskBuddyDb {
  return userDb ?? openNamed(DATABASE_NAME);
}

export async function openUserDb(userId: string): Promise<TaskBuddyDb> {
  const { db } = await resolveUserDb(userId, { open: openNamed, migrate: migrateDb });
  userDb = db;
  return db;
}

export async function migrateDb(db: TaskBuddyDb): Promise<void> {
  migrateNodeDb(db);
}

export function openBenchmarkDb(): { db: TaskBuddyDb; close: () => void } {
  const handle = openNodeDb();
  return { db: handle.db, close: handle.close };
}

/** Test-only: drop every app DB (and the selected user) so the next getDb() starts empty. */
export function resetDbForTests(): void {
  for (const handle of openDbs.values()) handle.close();
  openDbs.clear();
  userDb = undefined;
}

/** Test helper: an in-memory DB with every migration applied. */
export function openMigratedNodeDb(options: { logger?: Logger } = {}): NodeDb {
  const handle = openNodeDb(':memory:', options);
  migrateNodeDb(handle.db);
  return handle;
}
