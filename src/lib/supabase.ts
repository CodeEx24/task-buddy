// Typed Supabase client (TB-19). Uses the publishable key only: what a user can read or change is
// decided by Postgres RLS, never by this client. Server-only keys live in supabase/functions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { getEnv } from './env';

export type TaskBuddySupabaseClient = SupabaseClient<Database>;

let client: TaskBuddySupabaseClient | undefined;

/** Lazy, memoized client. Nothing is created (and no env is read) at import time. */
export function getSupabaseClient(): TaskBuddySupabaseClient {
  if (!client) {
    const { supabaseUrl, supabasePublishableKey } = getEnv();
    client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
      // Nobody signs in until TB-20, which adds SecureStore-backed session storage.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
