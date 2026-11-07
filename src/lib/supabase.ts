// Typed Supabase client (TB-19). Uses the publishable key only: what a user can read or change is
// decided by Postgres RLS, never by this client. Server-only keys live in supabase/functions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { createSecureStoreAdapter } from '@/features/auth/session/secure-store-adapter';

import type { Database } from './database.types';
import { getEnv } from './env';

export type TaskBuddySupabaseClient = SupabaseClient<Database>;

let client: TaskBuddySupabaseClient | undefined;

/** Lazy, memoized client. Nothing is created (and no env is read) at import time. */
export function getSupabaseClient(): TaskBuddySupabaseClient {
  if (!client) {
    const { supabaseUrl, supabasePublishableKey } = getEnv();
    client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
      // TB-20: the session lives only in SecureStore (chunked, this device only). Refresh runs
      // while the app is in the foreground (features/auth/session/app-state-refresh.ts).
      // No deep-link session detection: sign-in is code-only (spec D3-A).
      auth: {
        storage: createSecureStoreAdapter(SecureStore, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
