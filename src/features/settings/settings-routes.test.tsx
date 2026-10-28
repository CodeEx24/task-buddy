import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Appearance, BackHandler, type AlertButton } from 'react-native';

import { getDb } from '@/db/client';
import { migrateDb, resetDbForTests } from '@/db/node-client';
import { getFakeAuth } from '@/features/auth/testing/fake-auth';
import { FAKE_EMAIL } from '@/features/auth/testing/fake-auth-client';
import { cleanupTaskTests } from '@/features/tasks/testing/task-test-utils';
import { setColorSchemePreference, themeVars } from '@/theme';

import { appearanceThemePreference } from './preferences/appearance';
import { readPreference, writePreference } from './repo/preference-repo';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes: root layout (DbGate, QueryProvider, AppearanceSync,
// SessionProvider and the TB-20 route guard), tabs and the Settings stack.
const APP_DIR = './src/app';
const ROUTE_TEST_TIMEOUT_MS = 30_000;

let setNativeColorScheme: jest.SpyInstance;
beforeEach(() => {
  setColorSchemePreference('system');
  cleanupTaskTests();
  resetDbForTests();
  getFakeAuth().control.reset({ signedIn: true });
  setNativeColorScheme = jest.spyOn(Appearance, 'setColorScheme');
});
afterEach(() => {
  // The app theme is JS-only: never a native night-mode override (it clipped text on device).
  expect(setNativeColorScheme).not.toHaveBeenCalled();
  setColorSchemePreference('system');
  jest.restoreAllMocks();
  cleanupTaskTests();
});

/** UiProvider's colour variables: every token class on screen resolves through them. */
function expectAppScheme(scheme: 'light' | 'dark') {
  const style: unknown = screen.getByTestId('ui-provider-root').props.style;
  expect(style).toContain(themeVars[scheme]);
}

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
    'Settings tab → Appearance page (tab bar stays) → Dark re-themes the open page and persists → back',
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

      expectAppScheme('light');
      await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked());
      // Regression (device, PR #19): the page where the choice is made re-themes at once, while
      // it stays mounted, without any Appearance change event.
      expectAppScheme('dark');
      expect(screen.getByTestId('settings-page-appearance')).toBeVisible();
      await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('dark'));

      await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
      await waitFor(() => expectAppScheme('light'));

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
      // A previous session stored Dark in the same database the next launch opens.
      await migrateDb(getDb());
      writePreference(getDb(), appearanceThemePreference, 'dark');

      await renderRouter(APP_DIR, { initialUrl: '/settings/appearance' });

      await screen.findByTestId('settings-page-appearance');
      expectAppScheme('dark');
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked());
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
