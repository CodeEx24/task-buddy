import { renderRouter, screen } from 'expo-router/testing-library';

// Release builds (__DEV__ false) must not expose the dev benchmark route.
// Separate file: Expo Router keeps navigation state between renders within one test file.
describe('dev DB benchmark route in a release build', () => {
  it('renders the not-found screen', async () => {
    const globals = globalThis as unknown as { __DEV__: boolean };
    globals.__DEV__ = false;
    try {
      await renderRouter('./app', { initialUrl: '/dev/db-benchmark' });
      expect(screen.getByTestId('not-found-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('db-benchmark-screen')).toBeNull();
    } finally {
      globals.__DEV__ = true;
    }
  });
});
