import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// The tab bar's icons load fonts through expo-asset, which Jest can't resolve (TB-18).
jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real src/app/dev/crash-test.tsx route in a dev build with no Sentry DSN (TB-37).
describe('dev crash test route', () => {
  it('shows that Sentry is off without a DSN and the handled-error button is a safe no-op', async () => {
    await renderRouter('./src/app', { initialUrl: '/dev/crash-test' });
    expect(await screen.findByTestId('crash-test-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('crash-reporting-status')).toHaveTextContent(
      'Sentry is off (no valid EXPO_PUBLIC_SENTRY_DSN)',
    );
    expect(() => fireEvent.press(screen.getByTestId('crash-test-handled'))).not.toThrow();
  }, 30_000);
});
