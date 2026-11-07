import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
// Internal module (exported via `expo-router/build/*`): the URL-to-path step of native linking.
import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL';
import { Alert, type AlertButton } from 'react-native';

import { SIGN_IN_ERRORS } from './copy';
import { getFakeAuth } from './testing/fake-auth';
import { FAKE_VALID_CODE } from './testing/fake-auth-client';

// The tab bar's icons load fonts through expo-asset, which Jest can't resolve (TB-18).
jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes (root layout with DbGate, SessionProvider and the guard).
const APP_DIR = './src/app';
const TASK_ID = '0190f3b2-7c1a-7d4e-9b2f-3a6c8e1d5f42';
const ROUTE_TEST_TIMEOUT_MS = 30_000;

afterEach(() => {
  jest.restoreAllMocks();
});

function expectSignInOnly() {
  expect(screen.getByTestId('sign-in-screen')).toBeOnTheScreen();
  for (const id of ['home-screen', 'inbox-screen', 'settings-screen', 'task-detail-modal']) {
    expect(screen.queryByTestId(id)).toBeNull();
  }
}

describe('route guard: signed out (TB-20, spec D2-A)', () => {
  beforeEach(() => getFakeAuth().control.reset({ signedIn: false }));

  it.each(['/', '/inbox', '/settings', '/task/new', `/task/${TASK_ID}`, '/dev/db-benchmark'])(
    'shows sign-in instead of %s',
    async (url) => {
      await renderRouter(APP_DIR, { initialUrl: url });
      expectSignInOnly();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'does not open a task from a taskbuddy:// deep link',
    async () => {
      const path = extractExpoPathFromURL([], `taskbuddy://task/${TASK_ID}`);
      await renderRouter(APP_DIR, { initialUrl: `/${path}` });
      expectSignInOnly();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'shows a blank gate, not sign-in, while the stored session is being read',
    async () => {
      const fake = getFakeAuth();
      fake.control.reset({ signedIn: true, holdInitialSession: true });
      await renderRouter(APP_DIR, { initialUrl: '/' });
      expect(screen.getByTestId('session-gate-pending')).toBeOnTheScreen();
      expect(screen.queryByTestId('sign-in-screen')).toBeNull();
      expect(screen.queryByTestId('home-screen')).toBeNull();

      await act(() => fake.control.releaseInitialSession());

      expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('sign-in-screen')).toBeNull();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});

describe('email code sign-in (TB-20 AC1, AC2)', () => {
  beforeEach(() => getFakeAuth().control.reset({ signedIn: false }));

  it(
    'wrong code → inline error; right code → Today',
    async () => {
      const fake = getFakeAuth();
      await renderRouter(APP_DIR, { initialUrl: '/' });

      expect(screen.getByTestId('sign-in-send')).toBeDisabled();
      await fireEvent.changeText(screen.getByTestId('sign-in-email'), ' Jane@Example.com ');
      await fireEvent.press(screen.getByTestId('sign-in-send'));

      expect(await screen.findByTestId('sign-in-code-step')).toBeOnTheScreen();
      expect(screen.getByText(/j•••@example\.com/)).toBeOnTheScreen();
      expect(fake.mocks.signInWithOtp).toHaveBeenCalledWith({
        email: 'jane@example.com',
        options: { shouldCreateUser: true },
      });

      // Typing the sixth digit submits.
      await fireEvent.changeText(screen.getByTestId('sign-in-code'), '000000');
      expect(await screen.findByText(SIGN_IN_ERRORS.invalidCode)).toBeOnTheScreen();
      expect(screen.getByTestId('sign-in-code')).toHaveDisplayValue('000000');
      expect(screen.queryByTestId('home-screen')).toBeNull();

      await fireEvent.changeText(screen.getByTestId('sign-in-code'), FAKE_VALID_CODE);
      expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
      expect(screen).toHavePathname('/');
      expect(screen.queryByTestId('sign-in-screen')).toBeNull();
      expect(fake.mocks.verifyOtp).toHaveBeenLastCalledWith({
        email: 'jane@example.com',
        token: FAKE_VALID_CODE,
        type: 'email',
      });
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'pasting a code with a space submits it once',
    async () => {
      const fake = getFakeAuth();
      await renderRouter(APP_DIR, { initialUrl: '/' });
      await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'jane@example.com');
      await fireEvent.press(screen.getByTestId('sign-in-send'));
      await screen.findByTestId('sign-in-code-step');

      await fireEvent.changeText(screen.getByTestId('sign-in-code'), '123 456');
      expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
      expect(fake.mocks.verifyOtp).toHaveBeenCalledTimes(1);
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});

describe('signed in (TB-20 AC1, AC3)', () => {
  beforeEach(() => getFakeAuth().control.reset({ signedIn: true }));

  it(
    'a stored session opens Today directly, and sign-in is not reachable',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
      expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
      expect(screen.queryByTestId('sign-in-screen')).toBeNull();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'sign-out from Settings asks first, then shows sign-in',
    async () => {
      const fake = getFakeAuth();
      const alert = jest.spyOn(Alert, 'alert');
      await renderRouter(APP_DIR, { initialUrl: '/settings' });

      await fireEvent.press(screen.getByTestId('sign-out'));
      expect(alert).toHaveBeenCalledTimes(1);
      const buttons = (alert.mock.calls[0]?.[2] ?? []) as AlertButton[];
      expect(fake.mocks.signOut).not.toHaveBeenCalled();

      await act(async () => {
        buttons.find((b) => b.style === 'destructive')?.onPress?.();
      });

      expect(fake.mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      await waitFor(() => expectSignInOnly());
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'a session revoked on the server (SIGNED_OUT) returns to sign-in',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: `/task/${TASK_ID}` });
      expect(screen.getByTestId('task-detail-modal')).toBeVisible();

      await act(() => getFakeAuth().control.expireSession());

      await waitFor(() => expectSignInOnly());
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
