// The one place the auth feature reaches supabase-js (TB-20). Everything else in the app reads the
// session through `useSession()` and calls `features/auth/api`, never `supabase.auth` directly.
// Jest swaps this module for an in-memory fake (`../testing/jest-setup.ts`).
import type { TaskBuddySupabaseClient } from '@/lib/supabase';
import { getSupabaseClient } from '@/lib/supabase';

type SupabaseAuth = TaskBuddySupabaseClient['auth'];

/** The auth methods Task Buddy uses. Kept narrow so the test fake stays small. */
export type AuthClient = Pick<
  SupabaseAuth,
  | 'getSession'
  | 'onAuthStateChange'
  | 'signInWithOtp'
  | 'verifyOtp'
  | 'signOut'
  | 'startAutoRefresh'
  | 'stopAutoRefresh'
>;

export function getAuthClient(): AuthClient {
  return getSupabaseClient().auth;
}
