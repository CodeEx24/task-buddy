// One local database per signed-in account (TB-43, spec D5). Fixes TB-20's D7-A limitation: a
// second account on the same device opens its own file, so it never sees the first account's
// tasks, and nobody's unsynced changes are lost on sign-out.
//
// The pre-sync file `taskbuddy.db` belongs to whoever signs in first after this update (the
// owner is recorded in `sync_meta`), so existing local tasks are adopted and then backed up by
// sync. Everyone else gets `taskbuddy-<user id>.db`.
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { lists, preferences, subtasks, syncMeta, tags, tasks, taskTags } from './schema';
import type { TaskBuddyDb } from './types';

/** The database file every build before TB-43 used. */
export const LEGACY_DATABASE_NAME = 'taskbuddy.db';
const OWNER_KEY = 'owner_user_id';

// Supabase Auth user ids are UUIDs. Validated before they become part of a file name.
const userIdSchema = z.uuid();

export class DbOwnerMismatchError extends Error {
  constructor() {
    super('This database belongs to another account');
    this.name = 'DbOwnerMismatchError';
  }
}

function normalizeUserId(userId: string): string {
  return userIdSchema.parse(userId).toLowerCase();
}

/** File name of a user's own database (used when the legacy file belongs to someone else). */
export function userDatabaseName(userId: string): string {
  return `taskbuddy-${normalizeUserId(userId)}.db`;
}

/** The account recorded as owner of this database, or null if nobody has claimed it yet. */
export function readDbOwner(db: TaskBuddyDb): string | null {
  const row = db.select().from(syncMeta).where(eq(syncMeta.id, OWNER_KEY)).get();
  return row?.value ?? null;
}

/** Records `userId` as owner if the DB has none. Throws if another account already owns it. */
export function claimDbOwner(db: TaskBuddyDb, userId: string): void {
  const id = normalizeUserId(userId);
  db.insert(syncMeta).values({ id: OWNER_KEY, value: id }).onConflictDoNothing().run();
  if (readDbOwner(db) !== id) throw new DbOwnerMismatchError();
}

/** How a driver opens (cached) and migrates a named database file. */
export type DbOpener = {
  open: (name: string) => TaskBuddyDb;
  migrate: (db: TaskBuddyDb) => Promise<void>;
};

/**
 * Opens and migrates the database for `userId`: the legacy file if it is unclaimed or already
 * theirs, otherwise their own file. The returned DB is always owned by `userId`.
 */
export async function resolveUserDb(
  userId: string,
  opener: DbOpener,
): Promise<{ name: string; db: TaskBuddyDb }> {
  const id = normalizeUserId(userId);
  const legacy = opener.open(LEGACY_DATABASE_NAME);
  await opener.migrate(legacy);
  const owner = readDbOwner(legacy);
  if (owner === null || owner === id) {
    claimDbOwner(legacy, id);
    return { name: LEGACY_DATABASE_NAME, db: legacy };
  }
  const name = userDatabaseName(id);
  const db = opener.open(name);
  await opener.migrate(db);
  claimDbOwner(db, id);
  return { name, db };
}

/**
 * TB-53: owner marker of a legacy file whose account was deleted. It matches no user id, so
 * `resolveUserDb` never hands the file to anyone again and every account uses its own file.
 * (Deleting the legacy file instead would let the next account claim a fresh one and lose
 * track of its own `taskbuddy-<id>.db`.)
 */
export const RETIRED_DB_OWNER = 'retired';

/** Thrown by `wipeUserDb` when a step failed; carries no file names or data. */
export class LocalWipeError extends Error {
  readonly failedSteps: number;
  constructor(failedSteps: number) {
    super(`local wipe failed (${failedSteps} step(s))`);
    this.name = 'LocalWipeError';
    this.failedSteps = failedSteps;
  }
}

/**
 * Empties every table of a database in one transaction (children first) and marks it retired.
 * Used for the legacy file of a deleted account.
 */
export function retireDb(db: TaskBuddyDb): void {
  db.transaction((tx) => {
    tx.delete(taskTags).run();
    tx.delete(subtasks).run();
    tx.delete(tasks).run();
    tx.delete(tags).run();
    tx.delete(lists).run();
    tx.delete(preferences).run();
    tx.delete(syncMeta).run();
    tx.insert(syncMeta).values({ id: OWNER_KEY, value: RETIRED_DB_OWNER }).run();
  });
}

/** How a driver opens, compacts and deletes database files (for `wipeUserDb`). */
export type DbWiper = DbOpener & {
  /** Rewrites the file so deleted rows leave no trace in free pages or the WAL. */
  compact: (name: string) => void;
  /** Closes (if open) and deletes the file. A file that doesn't exist is not an error. */
  deleteFile: (name: string) => void;
};

/**
 * TB-53 (account deletion): removes `userId`'s data from this device. Their own file is deleted;
 * the legacy file, if they own it, is emptied, compacted and retired. Another account's file is
 * never touched. Every step is attempted; throws `LocalWipeError` if any failed. Idempotent.
 * The caller must make sure `userId`'s DB is no longer selected (signed out).
 */
export async function wipeUserDb(userId: string, wiper: DbWiper): Promise<void> {
  const id = normalizeUserId(userId);
  let failedSteps = 0;
  try {
    const legacy = wiper.open(LEGACY_DATABASE_NAME);
    await wiper.migrate(legacy);
    if (readDbOwner(legacy) === id) {
      retireDb(legacy);
      wiper.compact(LEGACY_DATABASE_NAME);
    }
  } catch {
    failedSteps += 1;
  }
  try {
    wiper.deleteFile(userDatabaseName(id));
  } catch {
    failedSteps += 1;
  }
  if (failedSteps > 0) throw new LocalWipeError(failedSteps);
}
