// Builds the app's SyncRemote (TB-43). Jest replaces this module with one that returns null
// (testing/jest-setup.ts), so screen tests never reach the network.
import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase';

import { createSupabaseSyncRemote } from './supabase-remote';
import type { SyncRemote } from './sync-remote';

export function createSyncRemote(userId: string): SyncRemote | null {
  return createSupabaseSyncRemote(getSupabaseClient(), z.uuid().parse(userId));
}
