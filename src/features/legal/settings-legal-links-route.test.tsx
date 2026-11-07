import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { LEGAL_URLS } from './legal-config';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes (resolved from the Jest rootDir, the repo root).
const APP_DIR = './src/app';
// The only test in this file, so it alone pays for loading every route on a cold cache.
const ROUTE_TEST_TIMEOUT_MS = 30_000;

describe('Settings tab legal links (TB-54 AC1)', () => {
  it(
    'links the privacy policy, terms and AI disclosure from the real Settings route',
    async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      try {
        await renderRouter(APP_DIR, { initialUrl: '/settings' });

        expect(screen.getByTestId('settings-legal-links')).toBeVisible();
        await fireEvent.press(screen.getByRole('button', { name: 'Privacy Policy' }));
        await fireEvent.press(screen.getByRole('button', { name: 'Terms of Use' }));
        await fireEvent.press(screen.getByRole('button', { name: 'How AI uses your data' }));

        expect(openURL.mock.calls).toEqual([
          [LEGAL_URLS.privacy],
          [LEGAL_URLS.terms],
          [LEGAL_URLS.ai],
        ]);
      } finally {
        openURL.mockRestore();
      }
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
