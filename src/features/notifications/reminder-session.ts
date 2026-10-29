// When reminders are reconciled (TB-40). One session per signed-in account (RemindersProvider).
// Every job runs on one app-wide queue, so a previous account's cancel-all always finishes before
// the next account's first reconcile, and two reconciles never interleave their OS calls.
// Requests made while a reconcile waits in the queue coalesce into it.
import type { TaskBuddyDb } from '@/db/types';

import { reconcileReminders } from './reconcile-reminders';
import type { ReminderScheduler } from './reminder-scheduler';

export type ReminderSession = {
  /** Reconciles soon. `mayPrompt`: the OS permission prompt may show (after a user's task write). */
  request: (options: { mayPrompt: boolean }) => Promise<void>;
  /** Sign-out / account switch: no more reconciles, and every pending reminder is cancelled. */
  stop: () => Promise<void>;
};

export type ReminderSessionOptions = {
  db: TaskBuddyDb;
  scheduler: ReminderScheduler;
  now?: () => number;
};

let queueTail: Promise<void> = Promise.resolve();

/** Logs a failed job without task content. */
function logFailure(job: string, error: unknown): void {
  console.warn(`[reminders] ${job} failed`, {
    name: error instanceof Error ? error.name : typeof error,
  });
}

function enqueue(job: string, run: () => Promise<unknown>): Promise<void> {
  const next = queueTail.then(run).then(
    () => undefined,
    (error: unknown) => logFailure(job, error),
  );
  queueTail = next;
  return next;
}

export function startReminderSession({
  db,
  scheduler,
  now = Date.now,
}: ReminderSessionOptions): ReminderSession {
  let isStopped = false;
  // A reconcile waiting in the queue (not started yet); later requests join it.
  let queued: { mayPrompt: boolean; done: Promise<void> } | null = null;

  return {
    request: ({ mayPrompt }) => {
      if (isStopped) return Promise.resolve();
      if (queued) {
        queued.mayPrompt ||= mayPrompt;
        return queued.done;
      }
      const entry: { mayPrompt: boolean; done: Promise<void> } = {
        mayPrompt,
        done: Promise.resolve(),
      };
      entry.done = enqueue('reconcile', async () => {
        if (queued === entry) queued = null;
        if (isStopped) return;
        await reconcileReminders({ db, scheduler, now: now(), mayPrompt: entry.mayPrompt });
      });
      queued = entry;
      return entry.done;
    },
    stop: () => {
      if (isStopped) return Promise.resolve();
      isStopped = true;
      queued = null;
      return enqueue('cancel-all', () => scheduler.cancelAll());
    },
  };
}

// The signed-in account's session, for triggers outside React (sync pulls).
let activeSession: ReminderSession | null = null;

export function setActiveReminderSession(session: ReminderSession | null): void {
  activeSession = session;
}

/** TB-43 sync pulled task changes: reconcile (without prompting). No-op while signed out. */
export function requestReminderReconcile(): void {
  void activeSession?.request({ mayPrompt: false });
}
