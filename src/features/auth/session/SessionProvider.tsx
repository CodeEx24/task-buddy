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
    const { data } = auth.onAuthStateChange((_event, session) => {
      // Don't call other auth methods from here (supabase-js guidance); just mirror the session.
      setState({ session, isLoading: false, isSignedIn: session !== null });
    });
    return () => {
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
