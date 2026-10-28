import { renderRouter, screen } from 'expo-router/testing-library';

import { getEnv } from '@/lib/env';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getEnv: jest.fn(),
}));

// The UI showcase stays dev-only, even in a staging (EAS preview) release build.
describe('UI showcase route in a release build', () => {
  it('renders the not-found screen, also for staging', async () => {
    jest.mocked(getEnv).mockReturnValue({
      appEnv: 'staging',
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
    });
    const globals = globalThis as unknown as { __DEV__: boolean };
    globals.__DEV__ = false;
    try {
      await renderRouter('./src/app', { initialUrl: '/dev/ui-showcase' });
      expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('ui-showcase-screen')).toBeNull();
    } finally {
      globals.__DEV__ = true;
    }
  }, 30_000);
});
