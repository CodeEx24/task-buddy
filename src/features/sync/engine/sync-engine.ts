// One sync cycle (TB-43): push local changes, pull the server's changes, purge old tombstones.
// Pure orchestration over the local repo and a SyncRemote, so it runs the same in the app, in
// unit tests (in-memory server) and in the integration test (real local Supabase).
//
// Conflict rule (AC2): last writer wins per row, decided by the server on the clock-corrected
// `updated_at` (spec D3). The device never decides a conflict itself: a dirty row is never
// overwritten by a pull; its next push returns the winner, which the device then adopts.
import type { TaskBuddyDb } from '@/db/types';

import {
  advanceCursor,
  applyPulledRows,
  applyPushResult,
  listDirtyRows,
  purgeLocalTombstones,
  readCursor,
  TOMBSTONE_RETENTION_MS,
} from '../repo/sync-repo';
import type { PullFrom, SyncRemote } from '../remote/sync-remote';
import { serverTimestampMinus } from '../server-time';
import {
  SYNC_TABLE_NAMES,
  serverRowSchemas,
  type AnyServerRow,
  type SyncTableName,
} from '../sync-tables';

/** Rows per push call; the server accepts at most 500. */
export const PUSH_BATCH_SIZE = 200;
/** Rows per pull page. */
export const PULL_PAGE_SIZE = 500;
/**
 * Every pull re-reads the last 10 s of the feed. A write's server_updated_at is stamped when its
 * transaction starts, so a slow transaction can commit after a later-stamped one was already
 * pulled; re-reading the window catches it. Re-applying a row is idempotent.
 */
export const PULL_OVERLAP_MS = 10_000;
/** Safety stops: a cycle never loops forever on a misbehaving server. */
const MAX_PUSH_ROUNDS = 25;
const MAX_PULL_PAGES = 50;

export type SyncCycleResult = {
  pushed: number;
  /** Local rows whose content changed (pull, or a push that lost to a newer server copy). */
  changed: number;
  /** A child row arrived before its parent; run another cycle soon. */
  needsAnotherCycle: boolean;
};

export type SyncEngineOptions = {
  db: TaskBuddyDb;
  remote: SyncRemote;
  /** Device clock, injectable for tests. */
  now?: () => number;
};

/** Validates server rows at the boundary; a malformed row fails the cycle (never half-applied). */
function parseRows(table: SyncTableName, rows: unknown[]): AnyServerRow[] {
  const schema = serverRowSchemas[table];
  return rows.map((row) => schema.parse(row));
}

async function pushTable(
  { db, remote, now }: Required<SyncEngineOptions>,
  table: SyncTableName,
): Promise<{ pushed: number; changed: number }> {
  let pushed = 0;
  let changed = 0;
  for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
    const rows = listDirtyRows(db, table, PUSH_BATCH_SIZE);
    if (rows.length === 0) break;
    const response = await remote.push(table, rows, now());
    changed += applyPushResult(db, table, rows, parseRows(table, response.rows));
    pushed += rows.length;
    // A short batch was the last one. Rows the server could not place stay dirty and are
    // retried next cycle instead of looping here.
    if (rows.length < PUSH_BATCH_SIZE) break;
  }
  return { pushed, changed };
}

async function pullTable(
  { db, remote }: Required<SyncEngineOptions>,
  table: SyncTableName,
): Promise<{ changed: number; isBlocked: boolean }> {
  const cursor = readCursor(db, table);
  let from: PullFrom = cursor
    ? { kind: 'since', ts: serverTimestampMinus(cursor.ts, PULL_OVERLAP_MS) }
    : { kind: 'start' };
  let changed = 0;
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const rows = parseRows(table, await remote.pull(table, from, PULL_PAGE_SIZE));
    const result = applyPulledRows(db, table, rows);
    changed += result.changed;
    if (result.last) advanceCursor(db, table, result.last);
    if (result.isBlocked) return { changed, isBlocked: true };
    if (rows.length < PULL_PAGE_SIZE || !result.last) break;
    from = { kind: 'after', cursor: result.last };
  }
  return { changed, isBlocked: false };
}

/** Runs one full cycle. Throws SyncRemoteError (network / auth / server) or a local error. */
export async function runSyncCycle(options: SyncEngineOptions): Promise<SyncCycleResult> {
  const ctx: Required<SyncEngineOptions> = { now: Date.now, ...options };
  let pushed = 0;
  let changed = 0;
  // Parents before children, so the server's foreign keys always resolve.
  for (const table of SYNC_TABLE_NAMES) {
    const result = await pushTable(ctx, table);
    pushed += result.pushed;
    changed += result.changed;
  }
  let needsAnotherCycle = false;
  for (const table of SYNC_TABLE_NAMES) {
    const result = await pullTable(ctx, table);
    changed += result.changed;
    if (result.isBlocked) {
      needsAnotherCycle = true;
      break; // children of this table would be blocked too
    }
  }
  purgeLocalTombstones(ctx.db, ctx.now() - TOMBSTONE_RETENTION_MS);
  return { pushed, changed, needsAnotherCycle };
}
