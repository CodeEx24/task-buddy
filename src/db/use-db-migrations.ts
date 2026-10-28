import { useCallback, useEffect, useRef, useState } from 'react';

import { clearUserDb, openUserDb } from '@/db/client';

import { logDbError } from './db-errors';
import type { TaskBuddyDb } from './types';

export type DbMigrationStatus = 'pending' | 'ready' | 'error';

/**
 * Opens the signed-in user's DB (TB-43: one file per account) and runs pending migrations once
 * per attempt and per user. `retry()` starts a new attempt after an error. With no user
 * (signed out) nothing is opened and the status is `ready`. Repositories must not be used until
 * a user's DB is `ready`.
 * `onReady` runs synchronously after the migrations and before `status` turns `ready`, i.e. before
 * the app renders (TB-32: apply the stored theme without a flash). It must not throw.
 */
export function useDbMigrations(
  userId: string | null,
  onReady?: (db: TaskBuddyDb) => void,
): {
  status: DbMigrationStatus;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  // The result belongs to one user and attempt; anything else is still pending.
  const key = `${userId ?? ''}#${attempt}`;
  const [result, setResult] = useState<{ key: string; status: 'ready' | 'error' } | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (userId === null) {
      clearUserDb();
      return;
    }
    let isCancelled = false;
    (async () => {
      try {
        const db = await openUserDb(userId);
        if (isCancelled) return;
        onReadyRef.current?.(db);
        setResult({ key, status: 'ready' });
      } catch (error) {
        logDbError('migration', error);
        if (!isCancelled) setResult({ key, status: 'error' });
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [key, userId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (userId === null) return { status: 'ready', retry };
  return { status: result?.key === key ? result.status : 'pending', retry };
}
