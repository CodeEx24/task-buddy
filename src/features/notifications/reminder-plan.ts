// Pure reminder planning (TB-40): which reminders should be pending, and what to change to get
// there from what is pending now. No I/O, so every rule is unit-tested directly.
import { hasTimeOfDay } from '@/lib/dates';

import type { Reminder } from './reminder-scheduler';

/** The task fields a reminder depends on. */
export type ReminderTask = {
  id: string;
  title: string;
  status: string;
  dueAt: number | null;
  deletedAt: number | null;
};

/**
 * The reminders that should be pending: one per live, open task with a due time (not date-only)
 * after `from`, the soonest `cap` of them (ties by task id). `reconcileReminders` passes a `from`
 * slightly in the past so a reminder that is firing right now is kept, not cancelled.
 */
export function planReminders(
  tasks: readonly ReminderTask[],
  from: number,
  cap: number,
): Reminder[] {
  return tasks
    .filter(
      (task): task is ReminderTask & { dueAt: number } =>
        task.deletedAt === null &&
        task.status === 'open' &&
        task.dueAt !== null &&
        task.dueAt > from &&
        hasTimeOfDay(task.dueAt),
    )
    .sort((a, b) => a.dueAt - b.dueAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, cap))
    .map((task) => ({ taskId: task.id, fireAt: task.dueAt, title: task.title }));
}

export type ReminderChanges = {
  /** Task ids whose pending reminder must go (task done, deleted, undated, or out of the cap). */
  cancel: string[];
  /** Reminders to schedule: new ones and changed ones (time or title), replacing the old one. */
  schedule: Reminder[];
};

/**
 * The smallest set of changes that turns `pending` into `desired`. Empty when they match. A
 * reminder at or before `now` is never scheduled (it would be late), only kept if already pending.
 */
export function diffReminders(
  desired: readonly Reminder[],
  pending: readonly Reminder[],
  now: number,
): ReminderChanges {
  const wanted = new Map(desired.map((r) => [r.taskId, r]));
  const current = new Map(pending.map((r) => [r.taskId, r]));
  const cancel = [...current.keys()].filter((taskId) => !wanted.has(taskId));
  const changed = desired.filter((r) => {
    const existing = current.get(r.taskId);
    return !existing || existing.fireAt !== r.fireAt || existing.title !== r.title;
  });
  // A changed reminder that is already due can't be rescheduled: drop the stale one instead.
  for (const r of changed) if (r.fireAt <= now && current.has(r.taskId)) cancel.push(r.taskId);
  return { cancel, schedule: changed.filter((r) => r.fireAt > now) };
}
