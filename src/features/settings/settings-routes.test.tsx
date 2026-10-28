import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Appearance, BackHandler, type AlertButton } from 'react-native';

import { getDb } from '@/db/client';
import { migrateDb, resetDbForTests } from '@/db/node-client';
import { getFakeAuth } from '@/features/auth/testing/fake-auth';
import { FAKE_EMAIL } from '@/features/auth/testing/fake-auth-client';
import { cleanupTaskTests } from '@/features/tasks/testing/task-test-utils';

import { appearanceThemePreference } from './preferences/appearance';
import { readPreference, writePreference } from './repo/preference-repo';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes: root layout (DbGate, QueryProvider, AppearanceSync,
// SessionProvider and the TB-20 route guard), tabs and the Settings stack.
const APP_DIR = './src/app';
const ROUTE_TEST_TIMEOUT_MS = 30_000;

let setColorScheme: jest.SpyInstance;
beforeEach(() => {
  cleanupTaskTests();
  resetDbForTests();
  getFakeAuth().control.reset({ signedIn: true });
  setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  cleanupTaskTests();
});

/** The listener React Navigation registers for the Android hardware back key. */
function captureHardwareBack() {
  type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((eventName, handler) => {
    if (eventName === 'hardwareBackPress') listeners.push(handler);
    return { remove: () => listeners.splice(listeners.indexOf(handler), 1) };
  });
  return async () => {
    await act(async () => {
      for (const listener of [...listeners].reverse()) {
        if (listener({ type: 'hardwareBackPress', timeStamp: Date.now() })) return;
      }
    });
  };
}

describe('Settings routes (TB-32)', () => {
  it(
    'Settings tab → Appearance page (tab bar stays) → Dark applies and persists → back',
    async () => {
      const pressBack = captureHardwareBack();
      await renderRouter(APP_DIR, { initialUrl: '/' });

      await fireEvent.press(await screen.findByTestId('tab-settings'));
      expect(screen).toHavePathname('/settings');
      expect(screen.getByTestId('settings-screen')).toBeVisible();
      expect(screen.getByTestId('settings-section-account')).toBeVisible();

      await fireEvent.press(screen.getByTestId('settings-row-appearance'));
      expect(screen).toHavePathname('/settings/appearance');
      expect(await screen.findByTestId('settings-page-appearance')).toBeVisible();
      expect(screen.getByTestId('tab-settings')).toBeVisible();
      expect(screen.getByTestId('tab-settings')).toBeSelected();

      await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked());
      expect(setColorScheme).toHaveBeenLastCalledWith('dark');
      await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('dark'));

      await pressBack();
      expect(screen).toHavePathname('/settings');
      expect(screen.getByTestId('settings-screen')).toBeVisible();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'tapping the Settings tab on a preference page pops back to the list',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/settings' });
      await fireEvent.press(await screen.findByTestId('settings-row-appearance'));
      expect(await screen.findByTestId('settings-page-appearance')).toBeVisible();

      await fireEvent.press(screen.getByTestId('tab-settings'));

      await waitFor(() => expect(screen).toHavePathname('/settings'));
      expect(screen.getByTestId('settings-screen')).toBeVisible();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'Account shows the signed-in email; Sign out asks first, then shows sign-in (AC1)',
    async () => {
      const fake = getFakeAuth();
      const alert = jest.spyOn(Alert, 'alert');
      await renderRouter(APP_DIR, { initialUrl: '/settings' });

      expect(await screen.findByTestId('settings-account-email-value')).toHaveTextContent(
        FAKE_EMAIL,
      );
      await fireEvent.press(screen.getByTestId('sign-out'));
      expect(alert).toHaveBeenCalledTimes(1);
      expect(fake.mocks.signOut).not.toHaveBeenCalled();

      // Cancel keeps the user signed in on Settings.
      const buttons = (alert.mock.calls[0]?.[2] ?? []) as AlertButton[];
      await act(async () => {
        buttons.find((b) => b.style === 'cancel')?.onPress?.();
      });
      expect(fake.mocks.signOut).not.toHaveBeenCalled();
      expect(screen.getByTestId('settings-screen')).toBeVisible();

      await act(async () => {
        buttons.find((b) => b.style === 'destructive')?.onPress?.();
      });
      expect(fake.mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('settings-screen')).toBeNull();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'a stored Appearance preference is applied when the app launches',
    async () => {
      // A previous session stored Light in the same database the next launch opens.
      await migrateDb(getDb());
      writePreference(getDb(), appearanceThemePreference, 'light');
      setColorScheme.mockClear();

      await renderRouter(APP_DIR, { initialUrl: '/settings/appearance' });

      expect(setColorScheme).toHaveBeenCalledWith('light');
      await screen.findByTestId('settings-page-appearance');
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked());
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'shows a message for an unknown settings page',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/settings/not-a-page' });
      expect(await screen.findByTestId('settings-page-not-found')).toBeVisible();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
