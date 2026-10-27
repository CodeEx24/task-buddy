import { useCallback, useEffect, useState } from 'react';

import { getDb, migrateDb } from '@/db/client';

import { logDbError } from './db-errors';

export type DbMigrationStatus = 'pending' | 'ready' | 'error';

/**
 * Opens the app DB and runs pending migrations once per attempt. `retry()` starts a new attempt
 * after an error. Repositories must not be used until `status === 'ready'`.
 */
export function useDbMigrations(): { status: DbMigrationStatus; retry: () => void } {
  const [status, setStatus] = useState<DbMigrationStatus>('pending');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        await migrateDb(getDb());
        if (!isCancelled) setStatus('ready');
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
