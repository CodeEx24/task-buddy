import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { getDb } from '@/db/client';
import { resetDbForTests } from '@/db/node-client';
import { listOpenTasks } from '@/features/tasks/repo/task-repo';
import { cleanupTaskTests } from '@/features/tasks/testing/task-test-utils';

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
    'serves the Today tab at / (TB-27)',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/' });

      expect(await screen.findByTestId('today-screen')).toBeOnTheScreen();
      expect(screen).toHavePathname('/');
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'serves the design-system showcase at /dev/ui-showcase in development',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/dev/ui-showcase' });

      expect(await screen.findByTestId('ui-showcase-screen')).toBeOnTheScreen();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'the dev perf route seeds and removes 500 tasks (TB-27 AC3 device check)',
    async () => {
      cleanupTaskTests();
      resetDbForTests();
      await renderRouter(APP_DIR, { initialUrl: '/dev/perf-tasks' });

      await fireEvent.press(await screen.findByTestId('perf-tasks-seed'));
      expect(await screen.findByTestId('perf-tasks-status')).toHaveTextContent('Added 500 tasks.');
      expect(listOpenTasks(getDb(), { limit: 500 }).items).toHaveLength(500);

      await fireEvent.press(screen.getByTestId('perf-tasks-remove'));
      expect(await screen.findByText('Removed 500 tasks.')).toBeOnTheScreen();
      expect(listOpenTasks(getDb()).items).toHaveLength(0);
      cleanupTaskTests();
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
