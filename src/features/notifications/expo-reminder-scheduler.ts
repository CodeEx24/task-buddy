// expo-notifications implementation of `ReminderScheduler` (TB-40). The only module that imports
// expo-notifications; swap it for another vendor behind the same interface.
//
// Android: reminders use the "Task reminders" channel (high importance). The date trigger uses an
// exact alarm (`setExactAndAllowWhileIdle`) when the app may schedule exact alarms
// (`SCHEDULE_EXACT_ALARM`, app.json); otherwise Android may deliver it late (spec D3).
import * as Notifications from 'expo-notifications';
// Named imports: the `import/namespace` lint rule can't see enums re-exported with `export *`.
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { formatTime } from '@/lib/dates';

import {
  REMINDER_CHANNEL_ID,
  REMINDER_CHANNEL_NAME,
  reminderDataSchema,
  reminderIdentifier,
  taskIdFromReminderIdentifier,
  toReminderData,
  type Reminder,
  type ReminderPermission,
  type ReminderScheduler,
} from './reminder-scheduler';

function toPermission(status: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (status.granted) return 'granted';
  // iOS "deliver quietly" (provisional) still delivers to Notification Center.
  if (status.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return status.status === 'undetermined' ? 'undetermined' : 'denied';
}

/** A pending request this app scheduled as a reminder, or null for anything else. */
function toReminder(request: Notifications.NotificationRequest): Reminder | null {
  const taskId = taskIdFromReminderIdentifier(request.identifier);
  if (!taskId) return null;
  const data = reminderDataSchema.safeParse(request.content.data);
  if (!data.success || data.data.taskId !== taskId) {
    // Unreadable data: report it with an impossible time so reconciling replaces it.
    return { taskId, fireAt: -1, title: request.content.title ?? '' };
  }
  return { taskId, fireAt: data.data.fireAt, title: request.content.title ?? '' };
}

/** The task a tapped notification is for, or null when it is not a reminder tap. */
export function taskIdFromResponse(response: Notifications.NotificationResponse): string | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  return taskIdFromReminderIdentifier(response.notification.request.identifier);
}

export function createExpoReminderScheduler(): ReminderScheduler {
  let channelReady: Promise<void> | undefined;

  /** Android 8+: reminders need their channel, created before the permission prompt (Android 13+). */
  function ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    channelReady ??= Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: REMINDER_CHANNEL_NAME,
      importance: AndroidImportance.HIGH,
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        channelReady = undefined;
        throw error;
      });
    return channelReady;
  }

  return {
    async getPermission() {
      return toPermission(await Notifications.getPermissionsAsync());
    },

    async requestPermission() {
      await ensureChannel();
      return toPermission(
        await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        }),
      );
    },

    async listScheduled() {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return requests.map(toReminder).filter((r): r is Reminder => r !== null);
    },

    async schedule(reminder) {
      await ensureChannel();
      const identifier = reminderIdentifier(reminder.taskId);
      // Replace the task's pending reminder (explicitly, not relying on identifier reuse).
      await Notifications.cancelScheduledNotificationAsync(identifier);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: reminder.title,
          body: `Due at ${formatTime(reminder.fireAt)}`,
          data: toReminderData(reminder),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.fireAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    },

    async cancel(taskId) {
      await Notifications.cancelScheduledNotificationAsync(reminderIdentifier(taskId));
    },

    async cancelAll() {
      // Only our reminders: other notification kinds (later tickets) are left alone.
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        requests
          .filter((request) => taskIdFromReminderIdentifier(request.identifier) !== null)
          .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      );
    },

    subscribeToOpens(listener) {
      const open = (response: Notifications.NotificationResponse | null) => {
        if (!response) return;
        const taskId = taskIdFromResponse(response);
        if (!taskId) return;
        // Handled: a later remount (account switch) must not open it again.
        Notifications.clearLastNotificationResponse();
        listener(taskId);
      };
      // The tap that launched the app (cold start), then taps while it runs.
      open(Notifications.getLastNotificationResponse());
      const subscription = Notifications.addNotificationResponseReceivedListener(open);
      return () => subscription.remove();
    },
  };
}
