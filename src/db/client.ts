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
import { LEGACY_DATABASE_NAME, resolveUserDb, wipeUserDb } from './user-db';

export const DATABASE_NAME = LEGACY_DATABASE_NAME;
export const BENCHMARK_DATABASE_NAME = 'benchmark.db';

type ExpoDb = ReturnType<typeof drizzle<typeof schema>>;

function open(name: string): { db: ExpoDb; sqlite: SQLiteDatabase } {
  const sqlite = openDatabaseSync(name);
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return { db: drizzle(sqlite, { schema }), sqlite };
}

const openDbs = new Map<string, { db: ExpoDb; sqlite: SQLiteDatabase }>();
let userDb: TaskBuddyDb | undefined;
let userDbGeneration = 0;

function openNamed(name: string): ExpoDb {
  let handle = openDbs.get(name);
  if (!handle) {
    handle = open(name);
    openDbs.set(name, handle);
  }
  return handle.db;
}

/**
 * The signed-in user's database (selected by `openUserDb`, via DbGate). Before any user is
 * selected it falls back to the legacy file; screens that read data only render after DbGate.
 */
export function getDb(): TaskBuddyDb {
  return userDb ?? openNamed(DATABASE_NAME);
}

/** TB-43: opens, migrates and selects the database owned by `userId` (see `user-db.ts`). */
export async function openUserDb(userId: string): Promise<TaskBuddyDb> {
  // A newer open (fast account switch) or a sign-out wins over this one finishing late.
  const generation = ++userDbGeneration;
  const { db } = await resolveUserDb(userId, { open: openNamed, migrate: migrateDb });
  if (generation === userDbGeneration) userDb = db;
  return db;
}

/** TB-43: sign-out. Deselects the user's DB and cancels any open still in flight. */
export function clearUserDb(): void {
  userDbGeneration += 1;
  userDb = undefined;
}

/**
 * TB-53 (account deletion): removes `userId`'s data from this device (see `wipeUserDb`): deletes
 * their own file and empties + retires the legacy file if they own it. Call only after sign-out
 * (their DB is no longer selected); `pending-wipe.ts` does that. Throws `LocalWipeError`.
 */
export async function deleteUserDb(userId: string): Promise<void> {
  await wipeUserDb(userId, {
    open: openNamed,
    migrate: migrateDb,
    compact: (name) => {
      // VACUUM rebuilds the file without the deleted rows; the checkpoint empties the WAL.
      openDbs.get(name)?.sqlite.execSync('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
    },
    deleteFile: (name) => {
      const handle = openDbs.get(name);
      openDbs.delete(name);
      handle?.sqlite.closeSync();
      try {
        deleteDatabaseSync(name);
      } catch (error) {
        // expo-sqlite (Android and iOS) says "Database '<name>' not found" for a missing file.
        if (error instanceof Error && /not found/i.test(error.message)) return;
        throw error;
      }
    },
  });
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
