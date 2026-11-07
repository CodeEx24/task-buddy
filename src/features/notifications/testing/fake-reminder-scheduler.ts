// In-memory `ReminderScheduler` for tests (TB-40). Behaves like the OS: one pending reminder per
// task id, scheduling again replaces it, and a reminder can be "tapped" with `open`.
import type { Reminder, ReminderPermission, ReminderScheduler } from '../reminder-scheduler';

export type FakeReminderScheduler = ReminderScheduler & {
  /** Pending reminders by task id. */
  readonly pending: Map<string, Reminder>;
  permission: ReminderPermission;
  /** What the OS prompt answers when `requestPermission` is called while undetermined. */
  promptAnswer: 'granted' | 'denied';
  readonly calls: { schedule: number; cancel: number; cancelAll: number; prompts: number };
  /** Simulates the user tapping the reminder of `taskId`. */
  open: (taskId: string) => void;
  /** Pending reminders, soonest first. */
  list: () => Reminder[];
};

export function createFakeReminderScheduler(
  options: { permission?: ReminderPermission; promptAnswer?: 'granted' | 'denied' } = {},
): FakeReminderScheduler {
  const pending = new Map<string, Reminder>();
  const listeners = new Set<(taskId: string) => void>();
  const calls = { schedule: 0, cancel: 0, cancelAll: 0, prompts: 0 };

  const fake: FakeReminderScheduler = {
    pending,
    permission: options.permission ?? 'granted',
    promptAnswer: options.promptAnswer ?? 'granted',
    calls,
    getPermission: async () => fake.permission,
    requestPermission: async () => {
      if (fake.permission === 'undetermined') {
        calls.prompts += 1;
        fake.permission = fake.promptAnswer;
      }
      return fake.permission;
    },
    listScheduled: async () => [...pending.values()].map((r) => ({ ...r })),
    schedule: async (reminder) => {
      calls.schedule += 1;
      pending.set(reminder.taskId, { ...reminder });
    },
    cancel: async (taskId) => {
      calls.cancel += 1;
      pending.delete(taskId);
    },
    cancelAll: async () => {
      calls.cancelAll += 1;
      pending.clear();
    },
    subscribeToOpens: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: (taskId) => listeners.forEach((listener) => listener(taskId)),
    list: () => [...pending.values()].sort((a, b) => a.fireAt - b.fireAt),
  };
  return fake;
}
