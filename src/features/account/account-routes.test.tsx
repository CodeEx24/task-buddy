// TB-53: export and account deletion through the real `src/app/` routes (root layout, route guard,
// DbGate, tabs, Settings). The server is a jest mock of the account remote; the file system and
// the share sheet are in-memory fakes. AC3: both are reachable in three taps or fewer.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import { getDb } from '@/db/client';
import { resetDbForTests } from '@/db/node-client';
import { RETIRED_DB_OWNER, readDbOwner } from '@/db/user-db';
import { getFakeAuth } from '@/features/auth/testing/fake-auth';
import { createTask, listOpenTasks } from '@/features/tasks/repo/task-repo';
import { cleanupTaskTests } from '@/features/tasks/testing/task-test-utils';

import { AccountRemoteError, type AccountRemote } from './remote/account-remote';
import { disk, resetFileSharingMock, sharing } from './testing/expo-file-sharing-mock';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);
jest.mock(
  'expo-file-system',
  () => jest.requireActual('@/features/account/testing/expo-file-sharing-mock').fileSystem,
);
jest.mock(
  'expo-sharing',
  () => jest.requireActual('@/features/account/testing/expo-file-sharing-mock').sharing,
);
const mockDeleteAccount = jest.fn<ReturnType<AccountRemote['deleteAccount']>, []>();
jest.mock('@/features/account/remote/account-remote-factory', () => ({
  getAccountRemote: () => ({ deleteAccount: () => mockDeleteAccount() }),
}));

const APP_DIR = './src/app';
const ROUTE_TEST_TIMEOUT_MS = 30_000;

beforeEach(() => {
  cleanupTaskTests();
  resetDbForTests();
  resetFileSharingMock();
  mockDeleteAccount.mockReset();
  getFakeAuth().control.reset({ signedIn: true });
});
afterEach(() => {
  jest.restoreAllMocks();
  cleanupTaskTests();
});

/** Opens the app on Today and taps the Settings tab (tap 1). */
async function openSettings() {
  await renderRouter(APP_DIR, { initialUrl: '/' });
  await fireEvent.press(await screen.findByTestId('tab-settings'));
  expect(await screen.findByTestId('settings-section-account')).toBeVisible();
}

/** Taps "Delete account" (tap 2) and returns the confirmation's buttons. */
async function requestDeletion(alert: jest.SpyInstance) {
  await fireEvent.press(screen.getByTestId('delete-account'));
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0]?.[0]).toBe('Delete your account?');
  return (alert.mock.calls[0]?.[2] ?? []) as AlertButton[];
}

async function press(button: AlertButton | undefined) {
  await act(async () => {
    button?.onPress?.();
  });
}

describe('Settings → Account: export and delete (TB-53)', () => {
  it(
    'Export my data: Settings tab → Export (2 taps) shares a JSON file of my tasks (AC1)',
    async () => {
      await openSettings();
      createTask(getDb(), { title: 'Water the plants' });

      await fireEvent.press(screen.getByTestId('export-data'));

      await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalledTimes(1));
      const [uri, options] = sharing.shareAsync.mock.calls[0] ?? [];
      expect(uri).toMatch(/^file:\/\/.*\.json$/);
      expect(options).toMatchObject({ mimeType: 'application/json' });
      const written = JSON.parse(disk.get(uri as string) ?? '{}');
      expect(written.tasks.map((t: { title: string }) => t.title)).toEqual(['Water the plants']);
      expect(screen.queryByTestId('export-data-error')).toBeNull();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'Delete: Settings tab → Delete account → Delete (3 taps) deletes, signs out and wipes the device (AC2, AC3)',
    async () => {
      mockDeleteAccount.mockResolvedValue('deleted');
      const fake = getFakeAuth();
      const alert = jest.spyOn(Alert, 'alert');
      await openSettings();
      const db = getDb(); // this account's DB (it owns the device's first file)
      createTask(db, { title: 'Private task' });

      const buttons = await requestDeletion(alert);
      await press(buttons.find((b) => b.style === 'destructive'));

      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      expect(fake.mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
      // Once signed out, the owed wipe empties and retires the account's DB file.
      await waitFor(() => expect(readDbOwner(db)).toBe(RETIRED_DB_OWNER));
      expect(listOpenTasks(db).items).toEqual([]);
      expect(alert).toHaveBeenCalledTimes(1); // no error alert
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'Cancel does nothing: no server call, still signed in, data kept',
    async () => {
      const fake = getFakeAuth();
      const alert = jest.spyOn(Alert, 'alert');
      await openSettings();
      createTask(getDb(), { title: 'Keep me' });
      const owner = readDbOwner(getDb());

      const buttons = await requestDeletion(alert);
      await press(buttons.find((b) => b.style === 'cancel'));

      expect(mockDeleteAccount).not.toHaveBeenCalled();
      expect(fake.mocks.signOut).not.toHaveBeenCalled();
      expect(screen.getByTestId('settings-screen')).toBeVisible();
      expect(readDbOwner(getDb())).toBe(owner);
      expect(listOpenTasks(getDb()).items.map((t) => t.title)).toEqual(['Keep me']);
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'Offline: a clear message, nothing deleted, still signed in (not queued)',
    async () => {
      mockDeleteAccount.mockRejectedValue(new AccountRemoteError('network'));
      const fake = getFakeAuth();
      const alert = jest.spyOn(Alert, 'alert');
      await openSettings();
      createTask(getDb(), { title: 'Still here' });

      const buttons = await requestDeletion(alert);
      await press(buttons.find((b) => b.style === 'destructive'));

      await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
      expect(alert.mock.calls[1]?.[0]).toBe('Account not deleted');
      expect(alert.mock.calls[1]?.[1]).toMatch(/offline.*Nothing was deleted/i);
      expect(fake.mocks.signOut).not.toHaveBeenCalled();
      expect(screen.getByTestId('settings-screen')).toBeVisible();
      expect(screen.getByTestId('delete-account')).toBeEnabled();
      expect(listOpenTasks(getDb()).items.map((t) => t.title)).toEqual(['Still here']);
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
