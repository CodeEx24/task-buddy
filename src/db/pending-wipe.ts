// Local wipes owed to deleted accounts (TB-53, https://stratyge.atlassian.net/browse/TB-53).
//
// Once the server has deleted an account, the app records the account id here, then signs out.
// `useDbMigrations` runs the owed wipes when no account's DB is selected any more: right after the
// sign-out (the signed-in screens and sync have unmounted, so nothing reads the files while they
// are deleted) and on every later launch or sign-in, before a DB is opened. A wipe that fails, or
// an app killed between the server delete and the wipe, is therefore retried until it succeeds.
//
// The ids are kept in memory and in SecureStore (this device only; an account id is not secret,
// but SecureStore is the only persistent key-value store the app ships). Never logged.
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const STORE_KEY = 'taskbuddy.pending_account_wipes';
const idsSchema = z.array(z.uuid()).max(50);

export type PendingWipeStore = {
  read(): Promise<string | null>;
  write(value: string | null): Promise<void>;
};

const secureStore: PendingWipeStore = {
  read: () => SecureStore.getItemAsync(STORE_KEY),
  write: (value) =>
    value === null
      ? SecureStore.deleteItemAsync(STORE_KEY)
      : SecureStore.setItemAsync(STORE_KEY, value, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
};

let store: PendingWipeStore = secureStore;
const inMemory = new Set<string>();
let running: Promise<void> | null = null;

/** Test hook: swap the persistent store (and forget the in-memory ids). */
export function setPendingWipeStoreForTests(next: PendingWipeStore | null): void {
  store = next ?? secureStore;
  inMemory.clear();
  running = null;
}

async function readPersisted(): Promise<string[]> {
  try {
    const raw = await store.read();
    if (!raw) return [];
    const parsed = idsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function persist(ids: Set<string>): Promise<void> {
  try {
    await store.write(ids.size > 0 ? JSON.stringify([...ids]) : null);
  } catch {
    // The in-memory copy still covers this app run.
  }
}

/** Records that `userId`'s local data must be wiped. Never throws. */
export async function addPendingWipe(userId: string): Promise<void> {
  const parsed = z.uuid().safeParse(userId);
  if (!parsed.success) return;
  const id = parsed.data.toLowerCase();
  inMemory.add(id);
  const ids = new Set([...(await readPersisted()), id]);
  await persist(ids);
}

/**
 * Runs every owed wipe with `wipe` (one at a time; concurrent callers share one run). Ids whose
 * wipe succeeds are forgotten; failures stay for the next run. Never throws.
 */
export function runPendingWipes(wipe: (userId: string) => Promise<void>): Promise<void> {
  running ??= (async () => {
    try {
      const ids = new Set([...inMemory, ...(await readPersisted())]);
      if (ids.size === 0) return;
      const done = new Set<string>();
      for (const id of ids) {
        try {
          await wipe(id);
          done.add(id);
        } catch (error) {
          console.warn('[account] local wipe failed; will retry', {
            name: error instanceof Error ? error.name : typeof error,
          });
        }
      }
      // Forget only what was wiped: an id added meanwhile stays owed.
      for (const id of done) inMemory.delete(id);
      const left = new Set([...inMemory, ...(await readPersisted())].filter((id) => !done.has(id)));
      await persist(left);
    } finally {
      running = null;
    }
  })();
  return running;
}
