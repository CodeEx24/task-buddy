import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getDb } from '@/db/client';
import { taskHref } from '@/features/tasks/task-routes';

import type { ReminderScheduler } from '../reminder-scheduler';
import { setActiveReminderSession, startReminderSession } from '../reminder-session';
import { getReminderScheduler } from '../scheduler-factory';

/**
 * Keeps the signed-in user's due-time reminders in step with their tasks (TB-40). Mount inside
 * DbGate (the user's DB is open) and QueryProvider, only while signed in. Reconciles on start, on
 * foreground, after every successful task write (TanStack mutation: create, edit, complete,
 * delete, undo) and after a sync pull changes tasks (`requestReminderReconcile`). Unmounting
 * (sign-out, account switch) cancels every pending reminder. A tapped reminder opens its task.
 * Renders nothing.
 */
export function RemindersProvider({
  scheduler = getReminderScheduler(),
}: {
  scheduler?: ReminderScheduler;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const session = startReminderSession({ db: getDb(), scheduler });
    setActiveReminderSession(session);

    void session.request({ mayPrompt: false });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void session.request({ mayPrompt: false });
    });
    const stopWatchingWrites = queryClient.getMutationCache().subscribe((event) => {
      // The user just saved a task: the first reminder may ask for notification permission.
      if (event.type === 'updated' && event.action.type === 'success') {
        void session.request({ mayPrompt: true });
      }
    });
    const stopWatchingOpens = scheduler.subscribeToOpens((taskId) => router.push(taskHref(taskId)));

    return () => {
      appState.remove();
      stopWatchingWrites();
      stopWatchingOpens();
      setActiveReminderSession(null);
      void session.stop();
    };
  }, [queryClient, scheduler]);

  return null;
}
