import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';

import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { lists, subtasks, tasks } from '@/db/schema';
import { createList, softDeleteList } from '@/features/tasks/repo/list-repo';
import {
  createSubtask,
  createTask,
  softDeleteTask,
  updateTask,
} from '@/features/tasks/repo/task-repo';
import { installTestClock } from '@/features/tasks/repo/test-clock';
import { newId } from '@/lib/ids';

import { serverRowSchemas, type ServerRow } from '../sync-tables';
import {
  advanceCursor,
  applyPulledRows,
  applyPushResult,
  countDirtyRows,
  listDirtyRows,
  purgeLocalTombstones,
  readCursor,
} from './sync-repo';

const clock = installTestClock();
let handle: NodeDb;
beforeEach(() => {
  handle = openMigratedNodeDb();
});
afterEach(() => handle.close());

const TS = '2026-10-28T18:17:51.932733+00:00';

function serverTask(overrides: Partial<ServerRow<'tasks'>> = {}): ServerRow<'tasks'> {
  return serverRowSchemas.tasks.parse({
    id: newId(),
    created_at: 1,
    updated_at: 5_000,
    deleted_at: null,
    server_updated_at: TS,
    list_id: null,
    title: 'From the server',
    notes: null,
    status: 'open',
    priority: 1,
    due_at: null,
    completed_at: null,
    sort_order: 0,
    ...overrides,
  });
}

describe('sync-repo: dirty tracking', () => {
  it('every local write marks the row dirty, with no repository changes', () => {
    const task = createTask(handle.db, { title: 'New' });
    expect(listDirtyRows(handle.db, 'tasks', 10)).toEqual([
      expect.objectContaining({ id: task.id, title: 'New', updated_at: clock.now() }),
    ]);
    const [pushed] = listDirtyRows(handle.db, 'tasks', 10);
    expect(pushed).not.toHaveProperty('synced_updated_at');
    applyPushResult(handle.db, 'tasks', listDirtyRows(handle.db, 'tasks', 10), [
      serverTask({ id: task.id, title: 'New', updated_at: clock.now() }),
    ]);
    expect(countDirtyRows(handle.db)).toBe(0);

    clock.advance();
    updateTask(handle.db, task.id, { priority: 3 });
    expect(countDirtyRows(handle.db)).toBe(1);
  });

  it('pushes booleans as booleans and keeps every column (snake_case)', () => {
    const task = createTask(handle.db, { title: 'T' });
    createSubtask(handle.db, { taskId: task.id, title: 'S' });
    const [row] = listDirtyRows(handle.db, 'subtasks', 10);
    expect(row).toEqual({
      id: expect.any(String),
      created_at: clock.now(),
      updated_at: clock.now(),
      deleted_at: null,
      task_id: task.id,
      title: 'S',
      is_done: false,
      sort_order: 0,
    });
  });
});

describe('sync-repo: applying pulled rows', () => {
  it('inserts new rows clean and overwrites clean rows', () => {
    const row = serverTask();
    expect(applyPulledRows(handle.db, 'tasks', [row])).toEqual({
      changed: 1,
      last: { ts: TS, id: row.id },
      isBlocked: false,
      blockedId: null,
      seenIds: [row.id],
    });
    expect(countDirtyRows(handle.db)).toBe(0);
    const newer = { ...row, title: 'Newer', updated_at: 6_000 };
    expect(applyPulledRows(handle.db, 'tasks', [newer]).changed).toBe(1);
    expect(handle.db.select().from(tasks).where(eq(tasks.id, row.id)).get()?.title).toBe('Newer');
    // Same version again (overlap re-read): no write.
    expect(applyPulledRows(handle.db, 'tasks', [newer]).changed).toBe(0);
  });

  it('never overwrites a row with unpushed local changes (the server decides on the next push)', () => {
    const local = createTask(handle.db, { title: 'Local edit' });
    const result = applyPulledRows(handle.db, 'tasks', [
      serverTask({ id: local.id, title: 'Remote', updated_at: clock.now() + 60_000 }),
    ]);
    expect(result.changed).toBe(0);
    expect(result.last?.id).toBe(local.id);
    expect(handle.db.select().from(tasks).where(eq(tasks.id, local.id)).get()?.title).toBe(
      'Local edit',
    );
  });

  it('stops at a row whose list is not on the device yet, without applying later rows', () => {
    const first = serverTask();
    const orphan = serverTask({ list_id: newId() });
    const after = serverTask();
    expect(applyPulledRows(handle.db, 'tasks', [first, orphan, after])).toEqual({
      changed: 1,
      last: { ts: TS, id: first.id },
      isBlocked: true,
      blockedId: orphan.id,
      seenIds: [first.id],
    });
    expect(
      handle.db
        .select()
        .from(tasks)
        .all()
        .map((t) => t.id),
    ).toEqual([first.id]);

    // The same row blocking again on the next cycle means its parent is gone: skip it.
    const retry = applyPulledRows(handle.db, 'tasks', [orphan, after], orphan.id);
    expect(retry).toMatchObject({ changed: 1, isBlocked: false, last: { id: after.id } });
    expect(handle.db.select().from(tasks).all()).toHaveLength(2);
  });

  it('skips tombstones of rows the device does not have (nothing to delete, no churn)', () => {
    const tombstone = serverTask({ deleted_at: 4_000 });
    expect(applyPulledRows(handle.db, 'tasks', [tombstone])).toMatchObject({
      changed: 0,
      isBlocked: false,
      last: { id: tombstone.id },
    });
    expect(handle.db.select().from(tasks).all()).toEqual([]);
  });

  it('server rows are validated at the boundary', () => {
    expect(() => serverRowSchemas.tasks.parse({ ...serverTask(), title: '' })).toThrow(ZodError);
    expect(() => serverRowSchemas.tasks.parse({ ...serverTask(), status: 'archived' })).toThrow(
      ZodError,
    );
    expect(() => serverRowSchemas.tasks.parse({ ...serverTask(), id: 'not-a-uuid' })).toThrow(
      ZodError,
    );
    expect(serverRowSchemas.tasks.parse({ ...serverTask(), user_id: newId() })).not.toHaveProperty(
      'user_id',
    );
  });
});

describe('sync-repo: push results', () => {
  it('adopts the server copy only if the row was not edited while the push was in flight', () => {
    const task = createTask(handle.db, { title: 'Sent' });
    const sent = listDirtyRows(handle.db, 'tasks', 10);
    clock.advance();
    updateTask(handle.db, task.id, { title: 'Typed meanwhile' });
    const result = applyPushResult(handle.db, 'tasks', sent, [
      serverTask({ id: task.id, title: 'Sent', updated_at: 9_999 }),
    ]);
    expect(result).toEqual({ adopted: 0, changed: 0 });
    expect(handle.db.select().from(tasks).where(eq(tasks.id, task.id)).get()).toMatchObject({
      title: 'Typed meanwhile',
      syncedUpdatedAt: null,
    });
  });

  it('adopts a newer server winner and its clock-corrected updated_at', () => {
    const task = createTask(handle.db, { title: 'Lost' });
    const sent = listDirtyRows(handle.db, 'tasks', 10);
    const result = applyPushResult(handle.db, 'tasks', sent, [
      serverTask({ id: task.id, title: 'Won', updated_at: 123_456 }),
    ]);
    expect(result).toEqual({ adopted: 1, changed: 1 });
    expect(handle.db.select().from(tasks).where(eq(tasks.id, task.id)).get()).toMatchObject({
      title: 'Won',
      updatedAt: 123_456,
      syncedUpdatedAt: 123_456,
    });
  });
});

describe('sync-repo: cursors', () => {
  it('starts empty, only moves forward, and survives a corrupt value', () => {
    expect(readCursor(handle.db, 'tasks')).toBeNull();
    advanceCursor(handle.db, 'tasks', { ts: '2026-10-28T10:00:00.5+00:00', id: 'b' });
    advanceCursor(handle.db, 'tasks', { ts: '2026-10-28T10:00:00.25+00:00', id: 'z' });
    expect(readCursor(handle.db, 'tasks')).toEqual({ ts: '2026-10-28T10:00:00.5+00:00', id: 'b' });
    advanceCursor(handle.db, 'tasks', { ts: '2026-10-28T10:00:00.500000+00:00', id: 'c' });
    expect(readCursor(handle.db, 'tasks')?.id).toBe('c');
    expect(readCursor(handle.db, 'lists')).toBeNull();

    handle.sqlite.prepare("UPDATE sync_meta SET value = '{oops' WHERE id = 'cursor:tasks'").run();
    expect(readCursor(handle.db, 'tasks')).toBeNull();
  });
});

describe('sync-repo: local purge (AC3)', () => {
  const markAllSynced = () => {
    for (const table of ['lists', 'tasks', 'subtasks']) {
      handle.sqlite.prepare(`UPDATE ${table} SET synced_updated_at = updated_at`).run();
    }
  };

  it('keeps a tombstone that has not reached the server yet', () => {
    const task = createTask(handle.db, { title: 'Deleted offline' });
    softDeleteTask(handle.db, task.id);
    expect(purgeLocalTombstones(handle.db, clock.now() + 1)).toEqual({
      lists: 0,
      tasks: 0,
      subtasks: 0,
    });
    markAllSynced();
    expect(purgeLocalTombstones(handle.db, clock.now() + 1).tasks).toBe(1);
  });

  it('only purges tombstones older than the cutoff, and never live rows', () => {
    const live = createTask(handle.db, { title: 'Live' });
    const step = createSubtask(handle.db, { taskId: live.id, title: 'step' });
    const doomed = createTask(handle.db, { title: 'Old' });
    softDeleteTask(handle.db, doomed.id);
    markAllSynced();
    expect(purgeLocalTombstones(handle.db, clock.now()).tasks).toBe(0); // not older than cutoff
    expect(purgeLocalTombstones(handle.db, clock.now() + 1).tasks).toBe(1);
    expect(
      handle.db
        .select()
        .from(tasks)
        .all()
        .map((t) => t.id),
    ).toEqual([live.id]);
    expect(
      handle.db
        .select()
        .from(subtasks)
        .all()
        .map((s) => s.id),
    ).toEqual([step.id]);
  });

  it('keeps a deleted list while a task still points at it', () => {
    const list = createList(handle.db, { name: 'L' });
    createTask(handle.db, { title: 'T', listId: list.id });
    softDeleteList(handle.db, list.id); // moves the task to the Inbox
    handle.sqlite.prepare('UPDATE tasks SET list_id = ?').run(list.id); // e.g. from an old pull
    markAllSynced();
    expect(purgeLocalTombstones(handle.db, clock.now() + 1).lists).toBe(0);
    handle.sqlite.prepare('UPDATE tasks SET list_id = NULL').run();
    expect(purgeLocalTombstones(handle.db, clock.now() + 1).lists).toBe(1);
    expect(handle.db.select().from(lists).all()).toEqual([]);
  });
});
