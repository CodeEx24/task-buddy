// Local preference repository (TB-32). One live row per key in `preferences`; values are JSON
// validated against the preference's Zod schema (see `../preferences/define-preference.ts`).
// Every write sets `updated_at`; a reset is a soft delete, so the default applies again.
import { and, eq, isNull } from 'drizzle-orm';

import { preferences } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { guardDb } from '@/features/tasks/repo/repo-utils';
import { newId } from '@/lib/ids';

import {
  decodePreference,
  encodePreference,
  type PreferenceDefinition,
} from '../preferences/define-preference';

function findLiveRow(db: TaskBuddyDb, key: string) {
  return db
    .select({ id: preferences.id, value: preferences.value })
    .from(preferences)
    .where(and(eq(preferences.key, key), isNull(preferences.deletedAt)))
    .get();
}

/** The stored value, or the default when nothing valid is stored. */
function readPreferenceUnchecked<T>(db: TaskBuddyDb, definition: PreferenceDefinition<T>): T {
  return decodePreference(definition, findLiveRow(db, definition.key)?.value);
}

/** Validates `value` (ZodError if invalid), then inserts or updates the key's live row. */
function writePreferenceUnchecked<T>(
  db: TaskBuddyDb,
  definition: PreferenceDefinition<T>,
  value: T,
): T {
  const stored = encodePreference(definition, value);
  const now = Date.now();
  db.transaction((tx) => {
    const existing = findLiveRow(tx, definition.key);
    if (existing) {
      tx.update(preferences)
        .set({ value: stored, updatedAt: now })
        .where(eq(preferences.id, existing.id))
        .run();
    } else {
      tx.insert(preferences)
        .values({ id: newId(), key: definition.key, value: stored, createdAt: now, updatedAt: now })
        .run();
    }
  });
  return decodePreference(definition, stored);
}

/** Soft-deletes the key's live row, so the default applies again. */
function resetPreferenceUnchecked<T>(db: TaskBuddyDb, definition: PreferenceDefinition<T>): T {
  const now = Date.now();
  db.update(preferences)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(preferences.key, definition.key), isNull(preferences.deletedAt)))
    .run();
  return definition.defaultValue;
}

// Generic wrappers keep `T` (guardDb's own signature would widen it to unknown).
export function readPreference<T>(db: TaskBuddyDb, definition: PreferenceDefinition<T>): T {
  return guardDb(readPreferenceUnchecked<T>)(db, definition);
}

export function writePreference<T>(
  db: TaskBuddyDb,
  definition: PreferenceDefinition<T>,
  value: T,
): T {
  return guardDb(writePreferenceUnchecked<T>)(db, definition, value);
}

export function resetPreference<T>(db: TaskBuddyDb, definition: PreferenceDefinition<T>): T {
  return guardDb(resetPreferenceUnchecked<T>)(db, definition);
}
