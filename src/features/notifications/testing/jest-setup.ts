// Jest: reminders go to one in-memory fake scheduler instead of expo-notifications (TB-40).
// Tests that inspect reminders pass their own fake to RemindersProvider.
jest.mock('@/features/notifications/scheduler-factory', () => {
  const { createFakeReminderScheduler } = jest.requireActual<
    typeof import('@/features/notifications/testing/fake-reminder-scheduler')
  >('@/features/notifications/testing/fake-reminder-scheduler');
  const scheduler = createFakeReminderScheduler();
  return { getReminderScheduler: () => scheduler };
});
