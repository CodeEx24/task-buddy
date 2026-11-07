// Due-time reminders (TB-40): the vendor-neutral contract for scheduling local notifications.
// The app uses the expo-notifications implementation (expo-reminder-scheduler.ts); tests use the
// in-memory fake (testing/fake-reminder-scheduler.ts). Nothing here leaves the device.
import { z } from 'zod';

import { idSchema } from '@/features/tasks/schema';

/**
 * At most this many reminders are pending at once: the nearest ones. iOS keeps only 64 pending
 * local notifications per app (the soonest win); the headroom is for other notification kinds.
 */
export const MAX_SCHEDULED_REMINDERS = 60;

/** Android notification channel for reminders (spec D4). */
export const REMINDER_CHANNEL_ID = 'task-reminders';
export const REMINDER_CHANNEL_NAME = 'Task reminders';

const REMINDER_ID_PREFIX = 'task-reminder:';

/** One reminder: the task it is for, when it fires, and what it shows. */
export type Reminder = {
  taskId: string;
  /** Epoch ms. */
  fireAt: number;
  /** The task title, shown as the notification title (local only, never logged). */
  title: string;
};

/** OS notification permission, reduced to what the scheduler needs. */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

/**
 * Schedules and cancels reminders. Every reminder is keyed by its task id, so scheduling a task
 * again replaces its pending reminder. Implementations only ever touch their own reminders.
 */
export interface ReminderScheduler {
  getPermission(): Promise<ReminderPermission>;
  /** Shows the OS prompt when it still can; resolves with the resulting permission. */
  requestPermission(): Promise<ReminderPermission>;
  /** Pending reminders this app scheduled. */
  listScheduled(): Promise<Reminder[]>;
  /** Schedules `reminder`, replacing any pending reminder for the same task. */
  schedule(reminder: Reminder): Promise<void>;
  cancel(taskId: string): Promise<void>;
  /** Cancels every pending reminder (sign-out, account switch). */
  cancelAll(): Promise<void>;
  /**
   * Calls `listener` with the task id when the user taps a reminder, including the tap that
   * launched the app. Returns the unsubscribe function.
   */
  subscribeToOpens(listener: (taskId: string) => void): () => void;
}

/** The notification identifier of a task's reminder. */
export function reminderIdentifier(taskId: string): string {
  return `${REMINDER_ID_PREFIX}${taskId}`;
}

/** The task id inside a reminder identifier, or null for any other notification. */
export function taskIdFromReminderIdentifier(identifier: string): string | null {
  if (!identifier.startsWith(REMINDER_ID_PREFIX)) return null;
  const parsed = idSchema.safeParse(identifier.slice(REMINDER_ID_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

/** The deep link a reminder opens (TB-18 route `taskbuddy://task/<id>`). */
export function reminderUrl(taskId: string): string {
  return `taskbuddy://task/${taskId}`;
}

/** What a reminder carries in its notification `data`. Validated when read back. */
export const reminderDataSchema = z.object({
  kind: z.literal('task-reminder'),
  taskId: idSchema,
  fireAt: z.number().int().nonnegative(),
  url: z.string(),
});
export type ReminderData = z.infer<typeof reminderDataSchema>;

export function toReminderData(reminder: Reminder): ReminderData {
  return {
    kind: 'task-reminder',
    taskId: reminder.taskId,
    fireAt: reminder.fireAt,
    url: reminderUrl(reminder.taskId),
  };
}
