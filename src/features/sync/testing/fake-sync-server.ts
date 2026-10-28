// In-memory stand-in for the Supabase sync backend (TB-43), for unit tests. It follows the same
// rules as public.sync_push in supabase/migrations/*_offline_sync_tables.sql: owner forced to the
// caller, updated_at corrected by (server now - client now) and capped at server now, LWW with
// strict >, a task's unknown list → Inbox, a subtask without its task on the server → skipped.
// The SQL itself is covered by supabase/tests/database/sync_tables.test.sql and the integration
// test against the real local stack.
import { compareServerTimestamps } from '../server-time';
import {
  SyncRemoteError,
  type PullFrom,
  type RemoteConnection,
  type SyncRemote,
} from '../remote/sync-remote';
import type { PushRow, SyncTableName } from '../sync-tables';

type StoredRow = PushRow & { user_id: string; server_updated_at: string };

export type FakeSyncServer = ReturnType<typeof createFakeSyncServer>;

export function createFakeSyncServer(options: { now: () => number }) {
  const tables: Record<SyncTableName, Map<string, StoredRow>> = {
    lists: new Map(),
    tasks: new Map(),
    subtasks: new Map(),
  };
  const listeners = new Set<{ userId: string; onChange: () => void }>();
  let sequence = 0;

  /** Unique, increasing timestamptz text, like now() stamped per transaction. */
  function stamp(): string {
    sequence += 1;
    const iso = new Date(options.now()).toISOString(); // ...T12:00:00.123Z
    return `${iso.slice(0, 23)}${String(sequence % 1000).padStart(3, '0')}+00:00`;
  }

  const strip = (row: StoredRow) => {
    const { user_id: _owner, ...rest } = row;
    return rest;
  };

  function push(userId: string, table: SyncTableName, rows: PushRow[], clientNow: number) {
    const serverNow = options.now();
    const offset = serverNow - clientNow;
    const ts = stamp();
    const latest = new Map<string, PushRow>();
    for (const row of rows) {
      const id = row.id as string;
      const seen = latest.get(id);
      if (!seen || (row.updated_at as number) > (seen.updated_at as number)) latest.set(id, row);
    }
    let wrote = false;
    for (const [id, row] of latest) {
      const incoming: StoredRow = {
        ...row,
        user_id: userId,
        updated_at: Math.min((row.updated_at as number) + offset, serverNow),
        server_updated_at: ts,
      };
      if (table === 'tasks' && incoming.list_id !== null) {
        const list = tables.lists.get(incoming.list_id as string);
        if (!list || list.user_id !== userId) incoming.list_id = null;
      }
      if (table === 'subtasks') {
        const parent = tables.tasks.get(incoming.task_id as string);
        if (!parent || parent.user_id !== userId) continue;
      }
      const existing = tables[table].get(id);
      if (existing && existing.user_id !== userId) continue;
      if (existing && (existing.updated_at as number) >= (incoming.updated_at as number)) continue;
      if (existing) incoming.created_at = existing.created_at ?? incoming.created_at ?? null;
      tables[table].set(id, incoming);
      wrote = true;
    }
    if (wrote) {
      for (const listener of listeners) if (listener.userId === userId) listener.onChange();
    }
    return {
      rows: [...latest.keys()]
        .map((id) => tables[table].get(id))
        .filter((row): row is StoredRow => row !== undefined && row.user_id === userId)
        .map(strip),
    };
  }

  function pull(userId: string, table: SyncTableName, from: PullFrom, limit: number) {
    const ordered = [...tables[table].values()]
      .filter((row) => row.user_id === userId)
      .sort(
        (a, b) =>
          compareServerTimestamps(a.server_updated_at, b.server_updated_at) ||
          (a.id as string).localeCompare(b.id as string),
      );
    const after = ordered.filter((row) => {
      if (from.kind === 'start') return true;
      const order = compareServerTimestamps(
        row.server_updated_at,
        from.kind === 'since' ? from.ts : from.cursor.ts,
      );
      if (from.kind === 'since') return order >= 0;
      return order > 0 || (order === 0 && (row.id as string) > from.cursor.id);
    });
    return after.slice(0, limit).map(strip);
  }

  return {
    tables,
    /** Hard-deletes tombstones whose last server write is older than `cutoffTs`. */
    purge(cutoffTs: string) {
      for (const table of ['subtasks', 'tasks', 'lists'] as const) {
        for (const [id, row] of tables[table]) {
          if (
            row.deleted_at !== null &&
            compareServerTimestamps(row.server_updated_at, cutoffTs) < 0
          ) {
            tables[table].delete(id);
          }
        }
      }
    },
    /** A device's view of the server, signed in as `userId`. */
    remoteFor(userId: string) {
      let isOnline = true;
      /** Runs after the server applied a push but before the device sees the reply. */
      let beforeReply: (() => void) | undefined;
      /** The next push is applied on the server, but its reply is lost (connection drop). */
      let shouldDropNextReply = false;
      const ensureOnline = () => {
        if (!isOnline) throw new SyncRemoteError('network');
      };
      const remote: SyncRemote = {
        push: async (table, rows, clientNow) => {
          ensureOnline();
          const reply = push(userId, table, rows, clientNow);
          beforeReply?.();
          if (shouldDropNextReply) {
            shouldDropNextReply = false;
            throw new SyncRemoteError('network');
          }
          return reply;
        },
        pull: async (table, from, limit) => {
          ensureOnline();
          return pull(userId, table, from, limit);
        },
        subscribe: (onChange, onConnection: (state: RemoteConnection) => void) => {
          const listener = { userId, onChange };
          listeners.add(listener);
          onConnection('connected');
          return () => listeners.delete(listener);
        },
      };
      return {
        remote,
        setOnline: (online: boolean) => {
          isOnline = online;
        },
        setBeforeReply: (callback: (() => void) | undefined) => {
          beforeReply = callback;
        },
        dropNextReply: () => {
          shouldDropNextReply = true;
        },
      };
    },
  };
}
