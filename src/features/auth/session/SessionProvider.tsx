import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { registerAutoRefresh } from './app-state-refresh';
import { getAuthClient } from './auth-client';

export type SessionState = {
  session: Session | null;
  /** True until supabase-js has read the stored session (INITIAL_SESSION). */
  isLoading: boolean;
  isSignedIn: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

/** Fail closed: if the stored session hasn't been read by then, show sign-in instead of a blank screen. */
export const SESSION_RESTORE_TIMEOUT_MS = 5_000;

/**
 * Owns the auth session for the app (TB-20). Subscribes once to supabase-js auth events (an
 * external system), which also delivers the stored session at start-up, and keeps token refresh
 * tied to the app being in the foreground. Mount once, at the root.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    isLoading: true,
    isSignedIn: false,
  });

  useEffect(() => {
    const auth = getAuthClient();
    const detachRefresh = registerAutoRefresh(auth, AppState);
    const restoreTimeout = setTimeout(() => {
      setState((current) =>
        current.isLoading ? { session: null, isLoading: false, isSignedIn: false } : current,
      );
    }, SESSION_RESTORE_TIMEOUT_MS);
    const { data } = auth.onAuthStateChange((_event, session) => {
      clearTimeout(restoreTimeout);
      // Don't call other auth methods from here (supabase-js guidance); just mirror the session.
      // A session that arrives after the timeout still signs the user in.
      setState({ session, isLoading: false, isSignedIn: session !== null });
    });
    return () => {
      clearTimeout(restoreTimeout);
      data.subscription.unsubscribe();
      detachRefresh();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
