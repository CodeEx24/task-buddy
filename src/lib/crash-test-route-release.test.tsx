import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// A production release build (__DEV__ false, APP_ENV production) must not expose the crash
// trigger (TB-37). Separate file: Expo Router keeps navigation state between renders in one file.
describe('crash test route in a production build', () => {
  it('renders the not-found screen', async () => {
    const globals = globalThis as unknown as { __DEV__: boolean };
    const savedEnv = process.env.EXPO_PUBLIC_APP_ENV;
    globals.__DEV__ = false;
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    try {
      await renderRouter('./src/app', { initialUrl: '/dev/crash-test' });
      expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('crash-test-screen')).toBeNull();
    } finally {
      globals.__DEV__ = true;
      if (savedEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = savedEnv;
    }
  }, 30_000);
});
