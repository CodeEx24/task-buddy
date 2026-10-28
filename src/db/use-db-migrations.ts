import { useCallback, useEffect, useRef, useState } from 'react';

import { getDb, migrateDb } from '@/db/client';

import { logDbError } from './db-errors';
import type { TaskBuddyDb } from './types';

export type DbMigrationStatus = 'pending' | 'ready' | 'error';

/**
 * Opens the app DB and runs pending migrations once per attempt. `retry()` starts a new attempt
 * after an error. Repositories must not be used until `status === 'ready'`.
 * `onReady` runs synchronously after the migrations and before `status` turns `ready`, i.e. before
 * the app renders (TB-32: apply the stored theme without a flash). It must not throw.
 */
export function useDbMigrations(onReady?: (db: TaskBuddyDb) => void): {
  status: DbMigrationStatus;
  retry: () => void;
} {
  const [status, setStatus] = useState<DbMigrationStatus>('pending');
  const [attempt, setAttempt] = useState(0);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const db = getDb();
        await migrateDb(db);
        if (isCancelled) return;
        onReadyRef.current?.(db);
        setStatus('ready');
      } catch (error) {
        logDbError('migration', error);
        if (!isCancelled) setStatus('error');
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus('pending');
    setAttempt((n) => n + 1);
  }, []);

  return { status, retry };
}
