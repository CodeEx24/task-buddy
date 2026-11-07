// The sync backend behind an interface (CLAUDE.md: vendors behind interfaces). The app uses the
// Supabase implementation (supabase-remote.ts); tests use an in-memory server (testing/).
import type { PushRow, SyncCursor, SyncTableName } from '../sync-tables';

/** Where a pull starts: the whole feed, every change at or after `ts`, or strictly after a row. */
export type PullFrom =
  { kind: 'start' } | { kind: 'since'; ts: string } | { kind: 'after'; cursor: SyncCursor };

export type PushResponse = {
  /** The server's stored copy of every pushed row it accepted or kept (unvalidated). */
  rows: unknown[];
};

export type RemoteConnection = 'connected' | 'disconnected';

export type SyncRemoteErrorKind = 'network' | 'auth' | 'server';

/** A failed call. Carries a category and an optional code only, never row content. */
export class SyncRemoteError extends Error {
  readonly kind: SyncRemoteErrorKind;
  readonly code?: string;

  constructor(kind: SyncRemoteErrorKind, code?: string) {
    super(`Sync request failed (${kind})`);
    this.name = 'SyncRemoteError';
    this.kind = kind;
    if (code) this.code = code;
  }
}

export interface SyncRemote {
  /** Sends local rows of one table; the server applies last-writer-wins and returns its copies. */
  push(table: SyncTableName, rows: PushRow[], clientNow: number): Promise<PushResponse>;
  /** Own rows of `table` in (server_updated_at, id) order (unvalidated). */
  pull(table: SyncTableName, from: PullFrom, limit: number): Promise<unknown[]>;
  /**
   * Calls `onChange` when the server reports a change to the user's synced rows (a hint to
   * pull, never applied directly), and `onConnection` when the live channel connects or drops.
   * Returns an unsubscribe function.
   */
  subscribe(onChange: () => void, onConnection: (state: RemoteConnection) => void): () => void;
}
