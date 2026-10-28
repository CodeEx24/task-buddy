import { renderRouter, screen, fireEvent } from 'expo-router/testing-library';

import { resetDbForTests } from '@/db/node-client';

// The tab bar's icons load fonts through expo-asset, which Jest can't resolve (TB-18).
jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real src/app/dev/db-benchmark.tsx route (dev build: __DEV__ is true in Jest).
const APP_DIR = './src/app';

beforeEach(() => resetDbForTests());

describe('dev DB benchmark route', () => {
  it('lists the migrated tables and runs the 10,000-task benchmark', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await renderRouter(APP_DIR, { initialUrl: '/dev/db-benchmark' });

    expect(await screen.findByText('lists, subtasks, tags, task_tags, tasks')).toBeOnTheScreen();
    expect(screen.getByTestId('db-migrations')).toHaveTextContent('Migrations applied: 2');

    fireEvent.press(screen.getByTestId('db-benchmark-run'));

    expect(
      await screen.findByTestId('db-benchmark-p95', {}, { timeout: 30_000 }),
    ).toBeOnTheScreen();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[TB-21 benchmark]'));
    log.mockRestore();
  }, 60_000);
});
