// Delete my account (TB-53 AC2). Order matters:
//   1. the server deletes the account (Auth user + every owned row, by cascade). Offline or any
//      failure stops here with nothing changed; the request is never queued for later;
//   2. record that this account's local data is owed a wipe (`src/db/pending-wipe.ts`, persisted);
//   3. sign out on this device (removes the session from SecureStore; the app shows sign-in);
//   4. remove export files from the cache.
// The DB wipe itself runs from `useDbMigrations` once the signed-out tree has rendered, i.e. after
// the signed-in screens and the sync engine have unmounted, and is retried on later launches if it
// fails or the app is killed first.
import { addPendingWipe } from '@/db/pending-wipe';
import { signOut } from '@/features/auth/api/auth-api';

import { loadShareModule } from '../export/load-share-module';
import { getAccountRemote } from '../remote/account-remote-factory';
import { AccountRemoteError, type AccountRemote } from '../remote/account-remote';

export type DeleteAccountFailure = 'offline' | 'session' | 'failed';
export type DeleteAccountResult = { ok: true } | { ok: false; reason: DeleteAccountFailure };

export type DeleteAccountDeps = {
  remote: AccountRemote;
  /** Records the account for the local DB wipe. Must not throw. */
  markForWipe: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Removes export files left in the cache. Must not throw. */
  deleteExports: () => Promise<void>;
};

const REASON_BY_KIND = { network: 'offline', auth: 'session', server: 'failed' } as const;

/** Removes export files (module loaded on demand, see load-share-module). Never throws. */
export async function deleteExportFiles(): Promise<void> {
  try {
    loadShareModule().deleteDataExports();
  } catch (error) {
    console.warn('[account] export cleanup failed', {
      name: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function deleteAccount(
  userId: string,
  deps: DeleteAccountDeps = {
    remote: getAccountRemote(),
    markForWipe: addPendingWipe,
    signOut,
    deleteExports: deleteExportFiles,
  },
): Promise<DeleteAccountResult> {
  try {
    await deps.remote.deleteAccount();
  } catch (error) {
    const kind = error instanceof AccountRemoteError ? error.kind : 'server';
    return { ok: false, reason: REASON_BY_KIND[kind] };
  }
  // The server account is gone: from here on the device must end signed out and wiped.
  await deps.markForWipe(userId);
  await deps.signOut();
  await deps.deleteExports();
  return { ok: true };
}
