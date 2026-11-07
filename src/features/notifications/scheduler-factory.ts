// The app's ReminderScheduler (TB-40). Jest replaces this module with an in-memory fake
// (testing/jest-setup.ts), so tests never reach expo-notifications.
import { createExpoReminderScheduler } from './expo-reminder-scheduler';
import type { ReminderScheduler } from './reminder-scheduler';

let scheduler: ReminderScheduler | undefined;

export function getReminderScheduler(): ReminderScheduler {
  scheduler ??= createExpoReminderScheduler();
  return scheduler;
}
