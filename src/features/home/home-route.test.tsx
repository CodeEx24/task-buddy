import { renderRouter, screen } from 'expo-router/testing-library';

// The tab bar's icons load fonts through expo-asset, which Jest can't resolve (TB-18).
jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes, so a broken or moved route fails here (TB-15 AC1).
// Resolved from the Jest rootDir (the repo root).
const APP_DIR = './src/app';
// The root layout runs local DB migrations (DbGate, TB-21) before rendering any screen, so
// screens appear asynchronously; cold Jest caches (CI) also make the first render slow.
const ROUTE_TEST_TIMEOUT_MS = 30_000;

describe('app routes', () => {
  it(
    'serves the placeholder home screen (the Today tab) at /',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/' });

      expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
      expect(screen).toHavePathname('/');
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'shows the not-found screen for an unknown route',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/does-not-exist' });

      expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
