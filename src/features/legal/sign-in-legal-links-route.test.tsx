import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { getFakeAuth } from '@/features/auth/testing/fake-auth';

import { SIGN_IN_AGREEMENT } from './components/LegalLinks';
import { LEGAL_URLS } from './legal-config';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes (root layout with DbGate, SessionProvider and the guard).
const APP_DIR = './src/app';
// Each test loads every route on its first render; a cold transform cache needs more than 5 s.
const ROUTE_TEST_TIMEOUT_MS = 30_000;

describe('sign-in legal links (TB-54 AC1)', () => {
  beforeEach(() => getFakeAuth().control.reset({ signedIn: false }));

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it(
    'shows the agreement and opens the privacy policy while signed out',
    async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      await renderRouter(APP_DIR, { initialUrl: '/sign-in' });

      expect(screen.getByTestId('sign-in-screen')).toBeOnTheScreen();
      expect(screen.getByTestId('sign-in-legal-links')).toBeOnTheScreen();
      expect(screen.getByText(SIGN_IN_AGREEMENT)).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Privacy Policy' }));
      expect(openURL).toHaveBeenCalledTimes(1);
      expect(openURL).toHaveBeenCalledWith(LEGAL_URLS.privacy);
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'is on the sign-in screen the guard shows for any signed-out URL',
    async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      await renderRouter(APP_DIR, { initialUrl: '/settings' });

      expect(screen.getByTestId('sign-in-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('settings-screen')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Terms of Use' }));
      expect(openURL).toHaveBeenCalledWith(LEGAL_URLS.terms);
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
