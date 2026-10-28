// Local side of sync (TB-43): the only code that reads or writes sync state in SQLite. Generic over
// the synced tables: columns come from the Drizzle schema, every value is a bound parameter, and
// identifiers come from the schema only (never from input).
//
// A row is "dirty" (has local changes to push) when synced_updated_at IS NULL or differs from
// updated_at. Repositories never write synced_updated_at, so every local edit marks its row dirty.
import { eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { lists, subtasks, syncMeta, tasks, taskTags } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { guardDb } from '@/features/tasks/repo/repo-utils';

import {
  SYNC_TABLE_NAMES,
  SYNC_TABLES,
  type AnyServerRow,
  type PushRow,
  type SyncCursor,
  type SyncTableName,
} from '../sync-tables';
import { compareServerTimestamps } from '../server-time';

/** Tombstones older than this are purged on the device and on the server (AC3). */
export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const SYNCED_COLUMN = 'synced_updated_at';

type ColumnInfo = { key: string; name: string; column: SQLiteColumn };

function columnsOf(table: SyncTableName): ColumnInfo[] {
  return Object.entries(getTableColumns(SYNC_TABLES[table])).map(([key, column]) => ({
    key,
    name: column.name,
    column: column as SQLiteColumn,
  }));
}

/** Data columns: everything except the device-only sync marker. */
function dataColumns(table: SyncTableName): ColumnInfo[] {
  return columnsOf(table).filter((c) => c.name !== SYNCED_COLUMN);
}

const ident = (name: string) => sql.identifier(name);
const dirtyWhere = sql`(${ident(SYNCED_COLUMN)} IS NULL OR ${ident(SYNCED_COLUMN)} <> ${ident('updated_at')})`;

type RawRow = Record<string, unknown>;

function toPushRow(table: SyncTableName, raw: RawRow): PushRow {
  const row: PushRow = {};
  for (const { name, column } of dataColumns(table)) {
    const value = raw[name];
    row[name] =
      value === null || value === undefined
        ? null
        : (column.mapFromDriverValue(value) as string | number | boolean);
  }
  return row;
}

/** Driver values for a server row, plus synced_updated_at = updated_at (the row is clean). */
function toDriverValues(table: SyncTableName, row: AnyServerRow): Map<string, unknown> {
  const source = row as unknown as Record<string, unknown>;
  const values = new Map<string, unknown>();
  for (const { name, column } of dataColumns(table)) {
    const value = source[name];
    values.set(name, value === null || value === undefined ? null : column.mapToDriverValue(value));
  }
  values.set(SYNCED_COLUMN, row.updated_at);
  return values;
}

function upsertSql(table: SyncTableName, row: AnyServerRow, onlyIf: SQL): SQL {
  const values = toDriverValues(table, row);
  const names = [...values.keys()];
  const updates = names
    .filter((n) => n !== 'id')
    .map((n) => sql`${ident(n)} = excluded.${ident(n)}`);
  return sql`INSERT INTO ${SYNC_TABLES[table]} (${sql.join(names.map(ident), sql`, `)})
    VALUES (${sql.join(
      names.map((n) => sql`${values.get(n)}`),
      sql`, `,
    )})
    ON CONFLICT (${ident('id')}) DO UPDATE SET ${sql.join(updates, sql`, `)} WHERE ${onlyIf}`;
}

function readRaw(db: TaskBuddyDb, table: SyncTableName, id: string): RawRow | undefined {
  return db.get<RawRow>(sql`SELECT * FROM ${SYNC_TABLES[table]} WHERE ${ident('id')} = ${id}`);
}

/** The parent a row needs locally before it can be inserted (foreign key), if any. */
function missingParent(db: TaskBuddyDb, table: SyncTableName, row: AnyServerRow): boolean {
  if (table === 'tasks') {
    const listId = (row as { list_id: string | null }).list_id;
    return listId !== null && readRaw(db, 'lists', listId) === undefined;
  }
  if (table === 'subtasks') {
    return readRaw(db, 'tasks', (row as { task_id: string }).task_id) === undefined;
  }
  return false;
}

// --- Push -------------------------------------------------------------------------------------

/** Up to `limit` rows with local changes, oldest change first. */
function listDirtyRowsUnchecked(db: TaskBuddyDb, table: SyncTableName, limit: number): PushRow[] {
  return db
    .all<RawRow>(
      sql`SELECT * FROM ${SYNC_TABLES[table]} WHERE ${dirtyWhere} ORDER BY ${ident('updated_at')}, ${ident('id')} LIMIT ${limit}`,
    )
    .map((raw) => toPushRow(table, raw));
}

function countDirtyRowsUnchecked(db: TaskBuddyDb): number {
  return SYNC_TABLE_NAMES.reduce((total, table) => {
    const row = db.get<{ n: number }>(
      sql`SELECT count(*) AS n FROM ${SYNC_TABLES[table]} WHERE ${dirtyWhere}`,
    );
    return total + (row?.n ?? 0);
  }, 0);
}

/**
 * Adopts the server's copy of pushed rows (the LWW winner, with the clock-corrected updated_at)
 * and marks them clean, unless the row was edited again while the push was in flight: then it
 * stays dirty and goes out with the next push. Returns how many rows changed content locally.
 */
function applyPushResultUnchecked(
  db: TaskBuddyDb,
  table: SyncTableName,
  sent: PushRow[],
  returned: AnyServerRow[],
): number {
  const sentVersion = new Map(sent.map((r) => [r.id as string, r.updated_at as number]));
  return db.transaction((tx) => {
    let changed = 0;
    for (const row of returned) {
      const version = sentVersion.get(row.id);
      if (version === undefined) continue;
      const before = readRaw(tx, table, row.id);
      if (!before || before.updated_at !== version) continue; // edited meanwhile, or gone
      // The winner may point at a list / task this device hasn't pulled yet: keep the row dirty;
      // the pull brings the parent and the next push hands the winner back again.
      if (missingParent(tx, table, row)) continue;
      tx.run(upsertSql(table, row, sql`${ident('updated_at')} = ${version}`));
      if (!sameContent(table, before, row)) changed += 1;
    }
    return changed;
  });
}

function sameContent(table: SyncTableName, raw: RawRow, row: AnyServerRow): boolean {
  const source = row as unknown as Record<string, unknown>;
  return dataColumns(table).every(({ name, column }) => {
    if (name === 'updated_at') return true;
    const local = raw[name] === null || raw[name] === undefined ? null : raw[name];
    const remote =
      source[name] === null || source[name] === undefined
        ? null
        : column.mapToDriverValue(source[name]);
    return local === remote;
  });
}

// --- Pull -------------------------------------------------------------------------------------

export type PullApplyResult = {
  /** Rows inserted or overwritten locally (the UI should refresh when > 0). */
  changed: number;
  /** Feed position of the last row handled; the cursor may advance to here. */
  last: SyncCursor | null;
  /** True when a row's parent is not on the device yet; rows from it on were not handled. */
  isBlocked: boolean;
};

/**
 * Applies rows from the server's change feed, in feed order:
 * - not on the device → inserted;
 * - clean on the device → overwritten (the server copy is the truth);
 * - dirty on the device → kept: the next push lets the server decide (LWW) and hands back the
 *   winner, so a local edit is never silently dropped here.
 * Stops at a row whose parent (list / task) isn't on the device yet, so the cursor never skips it.
 */
function applyPulledRowsUnchecked(
  db: TaskBuddyDb,
  table: SyncTableName,
  rows: AnyServerRow[],
): PullApplyResult {
  return db.transaction((tx) => {
    let changed = 0;
    let last: SyncCursor | null = null;
    for (const row of rows) {
      const before = readRaw(tx, table, row.id);
      if (!before && missingParent(tx, table, row)) return { changed, last, isBlocked: true };
      const isDirty =
        before !== undefined &&
        (before[SYNCED_COLUMN] === null || before[SYNCED_COLUMN] !== before.updated_at);
      const isSameVersion =
        before !== undefined && !isDirty && before.updated_at === row.updated_at;
      if (!isDirty && !isSameVersion) {
        if (before && missingParent(tx, table, row)) return { changed, last, isBlocked: true };
        tx.run(upsertSql(table, row, sql`1`));
        changed += 1;
      }
      last = { ts: row.server_updated_at, id: row.id };
    }
    return { changed, last, isBlocked: false };
  });
}

// --- Cursors ----------------------------------------------------------------------------------

const cursorKey = (table: SyncTableName) => `cursor:${table}`;

function readCursorUnchecked(db: TaskBuddyDb, table: SyncTableName): SyncCursor | null {
  const row = db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.id, cursorKey(table)))
    .get();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Partial<SyncCursor>;
    return typeof parsed.ts === 'string' && typeof parsed.id === 'string'
      ? { ts: parsed.ts, id: parsed.id }
      : null;
  } catch {
    return null; // A corrupt cursor only costs a full pull.
  }
}

/** Moves the cursor forward only; an older position (overlap re-read) never moves it back. */
function advanceCursorUnchecked(db: TaskBuddyDb, table: SyncTableName, next: SyncCursor): void {
  const current = readCursorUnchecked(db, table);
  if (current) {
    const order = compareServerTimestamps(next.ts, current.ts);
    if (order < 0 || (order === 0 && next.id <= current.id)) return;
  }
  const value = JSON.stringify(next);
  db.insert(syncMeta)
    .values({ id: cursorKey(table), value })
    .onConflictDoUpdate({ target: syncMeta.id, set: { value } })
    .run();
}

// --- Purge (AC3) ------------------------------------------------------------------------------

export type PurgeResult = { lists: number; tasks: number; subtasks: number };

/**
 * Hard-deletes synced (clean) tombstones deleted before `cutoff` (epoch ms), like the server's
 * daily purge. A purged task takes its subtasks and device-only tag links with it. A dirty
 * tombstone is kept until it has been pushed, and a deleted list stays while a task points at it.
 */
function purgeLocalTombstonesUnchecked(db: TaskBuddyDb, cutoff: number): PurgeResult {
  const purgeable = (table: SyncTableName) =>
    sql`SELECT ${ident('id')} FROM ${SYNC_TABLES[table]} WHERE ${ident('deleted_at')} IS NOT NULL AND ${ident('deleted_at')} < ${cutoff} AND NOT ${dirtyWhere}`;
  return db.transaction((tx) => {
    const taskIds = tx.all<{ id: string }>(purgeable('tasks')).map((r) => r.id);
    let subtaskCount = 0;
    for (const taskId of taskIds) {
      tx.delete(taskTags).where(eq(taskTags.taskId, taskId)).run();
      subtaskCount += tx
        .delete(subtasks)
        .where(eq(subtasks.taskId, taskId))
        .returning({ id: subtasks.id })
        .all().length;
    }
    subtaskCount += tx
      .delete(subtasks)
      .where(sql`${subtasks.id} IN (${purgeable('subtasks')})`)
      .returning({ id: subtasks.id })
      .all().length;
    for (const taskId of taskIds) tx.delete(tasks).where(eq(tasks.id, taskId)).run();
    const listCount = tx
      .delete(lists)
      .where(
        sql`${lists.id} IN (${purgeable('lists')}) AND NOT EXISTS (SELECT 1 FROM ${tasks} WHERE ${tasks.listId} = ${lists.id})`,
      )
      .returning({ id: lists.id })
      .all().length;
    return { lists: listCount, tasks: taskIds.length, subtasks: subtaskCount };
  });
}

// Public API: driver failures surface as RepoError('DB_FAILURE') without task data.
export const listDirtyRows = guardDb(listDirtyRowsUnchecked);
export const countDirtyRows = guardDb(countDirtyRowsUnchecked);
export const applyPushResult = guardDb(applyPushResultUnchecked);
export const applyPulledRows = guardDb(applyPulledRowsUnchecked);
export const readCursor = guardDb(readCursorUnchecked);
export const advanceCursor = guardDb(advanceCursorUnchecked);
export const purgeLocalTombstones = guardDb(purgeLocalTombstonesUnchecked);
