// Reminder reconciliation (TB-40): makes the pending reminders match the user's tasks. Idempotent,
// so it runs after every change instead of tracking each one: a create, edit, complete, delete or
// undo (any task write), a sync pull, app start and foreground.
import { listUpcomingTimedTasks } from '@/features/tasks/repo/task-repo';
import type { TaskBuddyDb } from '@/db/types';

import { diffReminders, planReminders } from './reminder-plan';
import {
  MAX_SCHEDULED_REMINDERS,
  type ReminderPermission,
  type ReminderScheduler,
} from './reminder-scheduler';

/**
 * A reminder due this recently still counts as wanted: reconciling while it is being delivered
 * must not cancel it.
 */
export const DUE_NOW_GRACE_MS = 60_000;

export type ReconcileOptions = {
  db: TaskBuddyDb;
  scheduler: ReminderScheduler;
  now: number;
  /**
   * Whether the OS permission prompt may be shown (spec D5): only right after the user saved a
   * task, never on start, foreground or sync.
   */
  mayPrompt: boolean;
};

export type ReconcileResult = {
  scheduled: number;
  cancelled: number;
  /** The permission checked, or null when no reminder was wanted (nothing to ask for). */
  permission: ReminderPermission | null;
};

export async function reconcileReminders({
  db,
  scheduler,
  now,
  mayPrompt,
}: ReconcileOptions): Promise<ReconcileResult> {
  const from = now - DUE_NOW_GRACE_MS;
  const pending = await scheduler.listScheduled();
  const isPending = new Set(pending.map((r) => r.taskId));
  const tasks = listUpcomingTimedTasks(db, { after: from, limit: MAX_SCHEDULED_REMINDERS });
  // Due in the last minute counts only when it is already pending (firing now): kept, not new.
  let desired = planReminders(tasks, from, MAX_SCHEDULED_REMINDERS).filter(
    (r) => r.fireAt > now || isPending.has(r.taskId),
  );

  let permission: ReminderPermission | null = null;
  if (desired.length > 0) {
    permission = await scheduler.getPermission();
    if (permission === 'undetermined' && mayPrompt) {
      permission = await scheduler.requestPermission();
    }
    // Denied (or not asked yet): nothing would show, so nothing stays scheduled. Asked again in
    // TB-41's permission flow; a later reconcile schedules everything once it is granted.
    if (permission !== 'granted') desired = [];
  }

  const { cancel, schedule } = diffReminders(desired, pending, now);
  for (const taskId of cancel) await scheduler.cancel(taskId);
  for (const reminder of schedule) await scheduler.schedule(reminder);
  return { scheduled: schedule.length, cancelled: cancel.length, permission };
}
