// In-memory stand-in for supabase-js auth (TB-20), used by every Jest test through
// `jest-setup.ts`. It behaves like the real client where screens care: INITIAL_SESSION on
// subscribe, SIGNED_IN after a correct code, SIGNED_OUT after sign-out, AuthApiError on a bad code.
import {
  AuthApiError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/supabase-js';

import type { AuthClient } from '../session/auth-client';

/** The only code the fake accepts. */
export const FAKE_VALID_CODE = '123456';
export const FAKE_USER_ID = '0190f3b2-0000-7000-8000-00000000a001';
export const FAKE_EMAIL = 'tester@example.com';

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

export function fakeSession(email: string = FAKE_EMAIL): Session {
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: FAKE_USER_ID,
      aud: 'authenticated',
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-28T00:00:00Z',
    },
  };
}

export type FakeAuthClient = ReturnType<typeof createFakeAuthClient>;

export function createFakeAuthClient({ signedIn }: { signedIn: boolean }) {
  let session: Session | null = signedIn ? fakeSession() : null;
  const listeners = new Set<Listener>();
  /**
   * Real supabase-js emits INITIAL_SESSION after an async storage read; route tests want it at
   * once. With `holdInitialSession`, delivery waits for `releaseInitialSession()`.
   */
  let isInitialSessionHeld = false;
  const heldDeliveries: (() => void)[] = [];
  /** Returned (once) by the next signInWithOtp call, to simulate rate limits / network errors. */
  let nextSendError: AuthError | null = null;

  const emit = (event: AuthChangeEvent) => {
    for (const listener of [...listeners]) listener(event, session);
  };

  const client = {
    getSession: jest.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: jest.fn((callback: Listener) => {
      listeners.add(callback);
      const deliver = () => {
        if (listeners.has(callback)) callback('INITIAL_SESSION', session);
      };
      if (isInitialSessionHeld) heldDeliveries.push(deliver);
      else deliver();
      const subscription = {
        id: 'fake',
        callback,
        unsubscribe: () => {
          listeners.delete(callback);
        },
      };
      return { data: { subscription } };
    }),
    signInWithOtp: jest.fn(async (_credentials: { email: string }) => {
      const error = nextSendError;
      nextSendError = null;
      return { data: { user: null, session: null }, error };
    }),
    verifyOtp: jest.fn(async ({ email, token }: { email: string; token: string }) => {
      if (token !== FAKE_VALID_CODE) {
        return {
          data: { user: null, session: null },
          error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
        };
      }
      session = fakeSession(email);
      emit('SIGNED_IN');
      return { data: { user: session.user, session }, error: null };
    }),
    signOut: jest.fn(async () => {
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    }),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
  };

  const control = {
    get session() {
      return session;
    },
    /** Start a test signed out (before rendering). */
    reset(options: { signedIn: boolean; holdInitialSession?: boolean }) {
      session = options.signedIn ? fakeSession() : null;
      nextSendError = null;
      isInitialSessionHeld = options.holdInitialSession ?? false;
      heldDeliveries.length = 0;
      for (const fn of Object.values(client)) fn.mockClear();
    },
    /** Delivers INITIAL_SESSION to subscribers that were held back. */
    releaseInitialSession() {
      isInitialSessionHeld = false;
      for (const deliver of heldDeliveries.splice(0)) deliver();
    },
    /** Server-side revoke / expiry while the app runs. */
    expireSession() {
      session = null;
      emit('SIGNED_OUT');
    },
    failNextSend(error: AuthError) {
      nextSendError = error;
    },
  };

  return { client: client as unknown as AuthClient, mocks: client, control };
}
