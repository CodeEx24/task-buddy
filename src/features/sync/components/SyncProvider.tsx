import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getDb } from '@/db/client';
import { requestReminderReconcile } from '@/features/notifications/reminder-session';
import { taskQueryKeys } from '@/features/tasks/hooks/task-query-keys';

import { runSyncCycle } from '../engine/sync-engine';
import { createSyncScheduler } from '../engine/sync-scheduler';
import { createSyncRemote } from '../remote/remote-factory';
import { SyncRemoteError } from '../remote/sync-remote';
import { useSyncStatusStore } from '../sync-status-store';

/** Logs a failed cycle without row content. Being offline is expected and not logged. */
function logSyncFailure(error: unknown): void {
  if (error instanceof SyncRemoteError) {
    if (error.kind !== 'network')
      console.warn('[sync] cycle failed', { kind: error.kind, code: error.code });
    return;
  }
  console.warn('[sync] cycle failed', { name: error instanceof Error ? error.name : typeof error });
}

/**
 * Keeps the signed-in user's local DB in sync with the cloud (TB-43). Mount inside DbGate (the
 * user's DB is open) and QueryProvider, only while signed in; unmounting (sign-out) stops sync.
 * A cycle runs on start, on foreground, after every local write (TanStack mutation), when
 * Realtime reports a change to the user's rows or reconnects, every 5 s while failing or
 * while Realtime is down, and every minute otherwise. Renders nothing.
 */
export function SyncProvider({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const remote = createSyncRemote(userId);
    if (!remote) return;
    const db = getDb();
    const { setPhase, reset } = useSyncStatusStore.getState();

    const scheduler = createSyncScheduler({
      run: async () => {
        const result = await runSyncCycle({ db, remote });
        // Pulled changes are in SQLite now; refetch so screens show them, and (TB-40) bring the
        // reminders in step with due times changed or tasks completed on another device.
        if (result.changed > 0) {
          void queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
          requestReminderReconcile();
        }
        return result;
      },
      onPhase: (phase, error) => {
        setPhase(phase);
        if (error !== undefined) logSyncFailure(error);
      },
    });

    if (AppState.currentState === 'background') scheduler.setActive(false);
    const appState = AppState.addEventListener('change', (state) =>
      scheduler.setActive(state === 'active'),
    );
    const stopWatchingWrites = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        scheduler.request('local-change');
      }
    });
    let isConnected = false;
    const unsubscribe = remote.subscribe(
      () => scheduler.request('remote-change'),
      (state) => {
        // (Re)connecting means we may have missed changes while offline: pull now.
        if (state === 'connected' && !isConnected) scheduler.request('reconnect');
        isConnected = state === 'connected';
        scheduler.setLive(isConnected);
      },
    );
    scheduler.request('start');

    return () => {
      scheduler.stop();
      appState.remove();
      stopWatchingWrites();
      unsubscribe();
      reset();
    };
  }, [queryClient, userId]);

  return null;
}
