import { renderRouter, screen } from 'expo-router/testing-library';

import { EnvError, getEnv, type Env } from '@/lib/env';

// The tab bar's icons load fonts through expo-asset, which Jest can't resolve (TB-18).
jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getEnv: jest.fn(),
}));

const mockGetEnv = jest.mocked(getEnv);
const envFor = (appEnv: Env['appEnv']): Env => ({
  appEnv,
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
});

// Release builds (__DEV__ false): the perf seeding route (TB-27 AC3) exists only for staging.
describe('perf tasks route in a release build', () => {
  const globals = globalThis as unknown as { __DEV__: boolean };
  beforeEach(() => {
    globals.__DEV__ = false;
  });
  afterEach(() => {
    globals.__DEV__ = true;
  });

  it('is hidden in production', async () => {
    mockGetEnv.mockReturnValue(envFor('production'));
    await renderRouter('./src/app', { initialUrl: '/dev/perf-tasks' });
    expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('perf-tasks-screen')).toBeNull();
  }, 30_000);

  it('is shown in staging (EAS preview)', async () => {
    mockGetEnv.mockReturnValue(envFor('staging'));
    await renderRouter('./src/app', { initialUrl: '/dev/perf-tasks' });
    expect(await screen.findByTestId('perf-tasks-screen')).toBeOnTheScreen();
  }, 30_000);

  it('is hidden when the env is missing or invalid', async () => {
    mockGetEnv.mockImplementation(() => {
      throw new EnvError([{ name: 'EXPO_PUBLIC_APP_ENV', rule: 'is required' }]);
    });
    await renderRouter('./src/app', { initialUrl: '/dev/perf-tasks' });
    expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('perf-tasks-screen')).toBeNull();
  }, 30_000);
});
