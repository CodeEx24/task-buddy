// App database client (TB-21): expo-sqlite + Drizzle. The only module that opens the device DB.
// Jest maps `@/db/client` to `./node-client` (better-sqlite3), which has the same exports.
//
// Requires the `.sql` inline import (babel `inline-import` + metro `sourceExts.push('sql')`)
// so `drizzle/migrations.js` can bundle the generated SQL.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { deleteDatabaseSync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import * as schema from './schema';
import type { TaskBuddyDb } from './types';

export const DATABASE_NAME = 'taskbuddy.db';
export const BENCHMARK_DATABASE_NAME = 'benchmark.db';

type ExpoDb = ReturnType<typeof drizzle<typeof schema>>;

function open(name: string): { db: ExpoDb; sqlite: SQLiteDatabase } {
  const sqlite = openDatabaseSync(name);
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return { db: drizzle(sqlite, { schema }), sqlite };
}

let appDb: ExpoDb | undefined;

/** The app database, opened lazily once. Run `migrateDb` (via DbGate) before using it. */
export function getDb(): TaskBuddyDb {
  appDb ??= open(DATABASE_NAME).db;
  return appDb;
}

/** Applies pending migrations. Drizzle runs them in one transaction, so a failure leaves no partial schema. */
export async function migrateDb(db: TaskBuddyDb): Promise<void> {
  await migrate(db as ExpoDb, migrations);
}

/** A fresh, empty DB file for the dev benchmark (never the user's data). Run `migrateDb` on it first. */
export function openBenchmarkDb(): { db: TaskBuddyDb; close: () => void } {
  try {
    deleteDatabaseSync(BENCHMARK_DATABASE_NAME);
  } catch {
    // No previous benchmark DB.
  }
  const { db, sqlite } = open(BENCHMARK_DATABASE_NAME);
  return { db, close: () => sqlite.closeSync() };
}
