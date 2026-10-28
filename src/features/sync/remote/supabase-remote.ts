// SyncRemote over Supabase (TB-43): push through the `sync_push` RPC (owner + LWW enforced in
// Postgres), pull with plain PostgREST selects under RLS, and Realtime postgres_changes as a
// "something changed, pull now" signal. Nothing here logs: rows hold task text.
import type { TaskBuddySupabaseClient } from '@/lib/supabase';

import type { PushRow, SyncTableName } from '../sync-tables';
import {
  SyncRemoteError,
  type PullFrom,
  type PushResponse,
  type RemoteConnection,
  type SyncRemote,
} from './sync-remote';

type PostgrestFailure = { code?: string } | null;

/** postgrest-js reports a failed fetch as status 0; 401/403 mean the session is not valid. */
function toRemoteError(status: number, error: PostgrestFailure): SyncRemoteError {
  if (status === 0) return new SyncRemoteError('network');
  if (status === 401 || status === 403 || error?.code === '42501') {
    return new SyncRemoteError('auth', error?.code);
  }
  return new SyncRemoteError('server', error?.code);
}

/** Thrown fetch errors (offline, DNS) become a network error. */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof SyncRemoteError) throw error;
    throw new SyncRemoteError('network');
  }
}

/** PostgREST `or` filter for rows strictly after (ts, id) in feed order. */
function afterFilter(ts: string, id: string): string {
  const quoted = `"${ts}"`;
  return `server_updated_at.gt.${quoted},and(server_updated_at.eq.${quoted},id.gt.${id})`;
}

export function createSupabaseSyncRemote(
  client: TaskBuddySupabaseClient,
  userId: string,
): SyncRemote {
  return {
    push: (table: SyncTableName, rows: PushRow[], clientNow: number) =>
      guarded(async () => {
        const { data, error, status } = await client.rpc('sync_push', {
          p_table: table,
          p_rows: rows,
          p_client_now: clientNow,
        });
        if (error) throw toRemoteError(status, error);
        const reply = data as { rows?: unknown } | null;
        return { rows: Array.isArray(reply?.rows) ? reply.rows : [] } satisfies PushResponse;
      }),

    pull: (table: SyncTableName, from: PullFrom, limit: number) =>
      guarded(async () => {
        let query = client
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .order('server_updated_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(limit);
        if (from.kind === 'since') query = query.gte('server_updated_at', from.ts);
        if (from.kind === 'after') query = query.or(afterFilter(from.cursor.ts, from.cursor.id));
        const { data, error, status } = await query;
        if (error) throw toRemoteError(status, error);
        return (data ?? []) as unknown[];
      }),

    subscribe: (onChange: () => void, onConnection: (state: RemoteConnection) => void) => {
      const channel = client.channel(`sync:${userId}`);
      for (const table of ['lists', 'tasks', 'subtasks'] as const) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
          () => onChange(),
        );
      }
      channel.subscribe((status) => {
        onConnection(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
      });
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
