import { ZodError } from 'zod';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateNodeDb, openMigratedNodeDb, openNodeDb, type NodeDb } from '@/db/node-client';
import { newId } from '@/lib/ids';

import { MAX_NOTES_LENGTH, MAX_SUBTASKS_PER_TASK, MAX_TITLE_LENGTH } from '../schema';
import { createList, softDeleteList } from './list-repo';
import { RepoError } from './repo-utils';
import { addTagToTask, createTag, listTagsForTask, softDeleteTag } from './tag-repo';
import {
  createSubtask,
  createTask,
  getTaskById,
  listCompletedTasks,
  listOpenTasks,
  listSubtasks,
  listUpcomingTimedTasks,
  moveSubtask,
  softDeleteSubtask,
  softDeleteTask,
  restoreTask,
  updateSubtask,
  updateTask,
} from './task-repo';
import { installTestClock } from './test-clock';

const clock = installTestClock();
let handle: NodeDb;
beforeEach(() => {
  handle = openMigratedNodeDb();
});
afterEach(() => handle.close());

const rawRow = (table: string, id: string) =>
  handle.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;

describe('task-repo: tasks', () => {
  it('creates a task with a UUIDv7 id, timestamps and defaults', () => {
    const task = createTask(handle.db, { title: '  Buy milk  ' });
    expect(task).toMatchObject({
      title: 'Buy milk',
      status: 'open',
      priority: 0,
      listId: null,
      notes: null,
      dueAt: null,
      completedAt: null,
      deletedAt: null,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    expect(task.id).toMatch(/^[0-9a-f-]{8}-[0-9a-f]{4}-7/);
    expect(getTaskById(handle.db, task.id)).toEqual(task);
  });

  it('validates input at the boundary', () => {
    expect(() => createTask(handle.db, { title: '   ' })).toThrow(ZodError);
    expect(() => createTask(handle.db, { title: 'x'.repeat(MAX_TITLE_LENGTH + 1) })).toThrow(
      ZodError,
    );
    expect(() =>
      createTask(handle.db, { title: 'ok', notes: 'n'.repeat(MAX_NOTES_LENGTH + 1) }),
    ).toThrow(ZodError);
    expect(() => createTask(handle.db, { title: 'ok', priority: 4 })).toThrow(ZodError);
    expect(() => createTask(handle.db, { title: 'ok', dueAt: 1.5 })).toThrow(ZodError);
    expect(() => getTaskById(handle.db, 'not-a-uuid')).toThrow(ZodError);
    // Max lengths are accepted.
    const long = createTask(handle.db, {
      title: 'x'.repeat(MAX_TITLE_LENGTH),
      notes: 'n'.repeat(MAX_NOTES_LENGTH),
    });
    expect(long.title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('stores hostile text verbatim (parameter binding, no injection)', () => {
    const title = `Robert'); DROP TABLE tasks;--`;
    const task = createTask(handle.db, { title });
    expect(getTaskById(handle.db, task.id)?.title).toBe(title);
    expect(handle.sqlite.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 1 });
  });

  it('surfaces driver failures as DB_FAILURE without task text', () => {
    handle.sqlite.exec(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );
    let caught: unknown;
    try {
      createTask(handle.db, { title: 'secret title', notes: 'secret notes' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RepoError);
    expect((caught as RepoError).code).toBe('DB_FAILURE');
    expect((caught as RepoError).dbError).toMatchObject({ code: 'SQLITE_CONSTRAINT_TRIGGER' });
    const serialized = JSON.stringify(caught) + String((caught as Error).message);
    expect(serialized).not.toContain('secret');
    expect((caught as Error & { cause?: unknown }).cause).toBeUndefined();
  });

  it('accepts only UUIDv7 ids', () => {
    expect(() => getTaskById(handle.db, '0190a6b2-1c3d-4e5f-8a9b-0c1d2e3f4a5b')).toThrow(ZodError);
  });

  it('rejects a missing or deleted list', () => {
    expect(() => createTask(handle.db, { title: 'a', listId: newId() })).toThrow(RepoError);
    const list = createList(handle.db, { name: 'Work' });
    softDeleteList(handle.db, list.id);
    expect(() => createTask(handle.db, { title: 'a', listId: list.id })).toThrow('List not found');
  });

  it('updates fields and sets updated_at on every write', () => {
    const task = createTask(handle.db, { title: 'a' });
    const t1 = clock.advance();
    const updated = updateTask(handle.db, task.id, { title: 'b', priority: 3, dueAt: 5 });
    expect(updated).toMatchObject({ title: 'b', priority: 3, dueAt: 5, updatedAt: t1 });
    expect(updated.createdAt).toBe(task.createdAt);
    expect(getTaskById(handle.db, task.id)).toEqual(updated);
  });

  it('ignores explicitly undefined patch keys', () => {
    const task = createTask(handle.db, { title: 'keep', notes: 'n' });
    const updated = updateTask(handle.db, task.id, { title: undefined, notes: undefined });
    expect(updated).toMatchObject({ title: 'keep', notes: 'n' });
    expect(getTaskById(handle.db, task.id)).toEqual(updated);
  });

  it('does not write for an empty patch', () => {
    const task = createTask(handle.db, { title: 'a' });
    clock.advance();
    expect(updateTask(handle.db, task.id, {})).toEqual(task);
    expect(updateTask(handle.db, task.id, { title: undefined })).toEqual(task);
    expect(getTaskById(handle.db, task.id)?.updatedAt).toBe(task.updatedAt);
  });

  it('stamps completed_at on done and clears it on reopen', () => {
    const task = createTask(handle.db, { title: 'a' });
    const doneAt = clock.advance();
    expect(updateTask(handle.db, task.id, { status: 'done' }).completedAt).toBe(doneAt);
    clock.advance();
    // Re-marking done keeps the original completion time.
    expect(updateTask(handle.db, task.id, { status: 'done' }).completedAt).toBe(doneAt);
    expect(updateTask(handle.db, task.id, { status: 'open' }).completedAt).toBeNull();
  });

  it('throws NOT_FOUND when updating a missing or deleted task', () => {
    expect(() => updateTask(handle.db, newId(), { title: 'x' })).toThrow('Task not found');
    const task = createTask(handle.db, { title: 'a' });
    softDeleteTask(handle.db, task.id);
    try {
      updateTask(handle.db, task.id, { title: 'x' });
      throw new Error('expected a RepoError');
    } catch (error) {
      expect(error).toBeInstanceOf(RepoError);
      expect((error as RepoError).code).toBe('NOT_FOUND');
    }
  });

  it('soft-deletes a task with its subtasks and tag links in one go', () => {
    const task = createTask(handle.db, { title: 'a' });
    const sub = createSubtask(handle.db, { taskId: task.id, title: 's' });
    const tag = createTag(handle.db, { name: 'home' });
    const link = addTagToTask(handle.db, task.id, tag.id);
    const t1 = clock.advance();

    expect(softDeleteTask(handle.db, task.id)).toBe(true);

    expect(getTaskById(handle.db, task.id)).toBeUndefined();
    for (const [table, id] of [
      ['tasks', task.id],
      ['subtasks', sub.id],
      ['task_tags', link.id],
    ] as const) {
      // Row still exists (soft delete) and is stamped.
      expect(rawRow(table, id)).toMatchObject({ deleted_at: t1, updated_at: t1 });
    }
    expect(rawRow('tags', tag.id)).toMatchObject({ deleted_at: null });
    // Second delete is a no-op and does not touch updated_at.
    clock.advance();
    expect(softDeleteTask(handle.db, task.id)).toBe(false);
    expect(rawRow('tasks', task.id)).toMatchObject({ updated_at: t1 });
  });
});

describe('task-repo: listOpenTasks', () => {
  function seed() {
    const list = createList(handle.db, { name: 'Work' });
    const make = (title: string, extra: Parameters<typeof createTask>[1] = { title }) =>
      createTask(handle.db, { ...extra, title });
    const rows = {
      undatedB: make('undated-b', { title: '', sortOrder: 2 }),
      dated2: make('dated-2', { title: '', dueAt: 2000, sortOrder: 0 }),
      undatedA: make('undated-a', { title: '', sortOrder: 1 }),
      dated1b: make('dated-1b', { title: '', dueAt: 1000, sortOrder: 5 }),
      dated1a: make('dated-1a', { title: '', dueAt: 1000, sortOrder: 1, listId: list.id }),
      done: make('done', { title: '', dueAt: 500 }),
      deleted: make('deleted', { title: '', dueAt: 600 }),
    };
    updateTask(handle.db, rows.done.id, { status: 'done' });
    softDeleteTask(handle.db, rows.deleted.id);
    return { list, rows };
  }

  it('returns live open tasks by due date (nulls last), then sort order', () => {
    seed();
    const page = listOpenTasks(handle.db);
    expect(page.items.map((t) => t.title)).toEqual([
      'dated-1a',
      'dated-1b',
      'dated-2',
      'undated-a',
      'undated-b',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('paginates with a keyset cursor across the dated/undated boundary', () => {
    seed();
    const titles: string[] = [];
    let cursor = null;
    for (let i = 0; i < 10; i++) {
      const page = listOpenTasks(handle.db, { limit: 2, cursor });
      titles.push(...page.items.map((t) => t.title));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(titles).toEqual(['dated-1a', 'dated-1b', 'dated-2', 'undated-a', 'undated-b']);
  });

  it('breaks ties on identical sort keys by id without skipping rows', () => {
    const made = Array.from({ length: 7 }, (_, i) =>
      createTask(handle.db, { title: `t${i}`, dueAt: 100, sortOrder: 0 }),
    );
    const seen: string[] = [];
    let cursor = null;
    do {
      const page = listOpenTasks(handle.db, { limit: 3, cursor });
      seen.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(made.map((t) => t.id).sort());
  });

  it('filters by list, and null means the Inbox', () => {
    const { list } = seed();
    expect(listOpenTasks(handle.db, { listId: list.id }).items.map((t) => t.title)).toEqual([
      'dated-1a',
    ]);
    expect(listOpenTasks(handle.db, { listId: null }).items.map((t) => t.title)).toEqual([
      'dated-1b',
      'dated-2',
      'undated-a',
      'undated-b',
    ]);
  });

  it('validates limit and cursor', () => {
    expect(() => listOpenTasks(handle.db, { limit: 0 })).toThrow(ZodError);
    expect(() => listOpenTasks(handle.db, { limit: 501 })).toThrow(ZodError);
    expect(() =>
      listOpenTasks(handle.db, { cursor: { dueAt: null, sortOrder: 0, id: 'x' } }),
    ).toThrow(ZodError);
  });
});

describe('task-repo: subtasks', () => {
  it('creates, updates, lists and soft-deletes subtasks', () => {
    const task = createTask(handle.db, { title: 'a' });
    const s2 = createSubtask(handle.db, { taskId: task.id, title: 'second', sortOrder: 2 });
    const s1 = createSubtask(handle.db, { taskId: task.id, title: 'first', sortOrder: 1 });
    expect(s1).toMatchObject({ isDone: false, deletedAt: null, updatedAt: clock.now() });
    expect(listSubtasks(handle.db, task.id).map((s) => s.title)).toEqual(['first', 'second']);

    const t1 = clock.advance();
    expect(updateSubtask(handle.db, s1.id, { isDone: true })).toMatchObject({
      isDone: true,
      updatedAt: t1,
    });
    expect(rawRow('subtasks', s1.id)).toMatchObject({ is_done: 1, updated_at: t1 });

    const t2 = clock.advance();
    expect(softDeleteSubtask(handle.db, s2.id)).toBe(true);
    expect(softDeleteSubtask(handle.db, s2.id)).toBe(false);
    expect(rawRow('subtasks', s2.id)).toMatchObject({ deleted_at: t2, updated_at: t2 });
    expect(listSubtasks(handle.db, task.id).map((s) => s.title)).toEqual(['first']);
    expect(() => updateSubtask(handle.db, s2.id, { title: 'x' })).toThrow('Subtask not found');
  });

  it('rejects subtasks on a missing or deleted task', () => {
    expect(() => createSubtask(handle.db, { taskId: newId(), title: 's' })).toThrow(
      'Task not found',
    );
    const task = createTask(handle.db, { title: 'a' });
    softDeleteTask(handle.db, task.id);
    expect(() => createSubtask(handle.db, { taskId: task.id, title: 's' })).toThrow(
      'Task not found',
    );
  });
});

describe('task-repo: subtask checklist order and limit (TB-28)', () => {
  const titles = (taskId: string) => listSubtasks(handle.db, taskId).map((s) => s.title);

  it('appends new subtasks to the end of the checklist', () => {
    const task = createTask(handle.db, { title: 'a' });
    const first = createSubtask(handle.db, { taskId: task.id, title: 'one' });
    expect(first.sortOrder).toBe(0);
    createSubtask(handle.db, { taskId: task.id, title: 'two' });
    createSubtask(handle.db, { taskId: task.id, title: 'three' });
    expect(titles(task.id)).toEqual(['one', 'two', 'three']);
    expect(listSubtasks(handle.db, task.id).map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  });

  it('moves a subtask up and down, writing updated_at only on rows that moved', () => {
    const task = createTask(handle.db, { title: 'a' });
    const [one, two, three] = ['one', 'two', 'three'].map((title) =>
      createSubtask(handle.db, { taskId: task.id, title }),
    );
    if (!one || !two || !three) throw new Error('expected three subtasks');

    const t1 = clock.advance();
    const moved = moveSubtask(handle.db, three.id, 'up');
    expect(moved.map((s) => s.title)).toEqual(['one', 'three', 'two']);
    expect(titles(task.id)).toEqual(['one', 'three', 'two']);
    expect(rawRow('subtasks', three.id)).toMatchObject({ sort_order: 1, updated_at: t1 });
    expect(rawRow('subtasks', two.id)).toMatchObject({ sort_order: 2, updated_at: t1 });
    expect(rawRow('subtasks', one.id)).toMatchObject({ updated_at: one.updatedAt });

    clock.advance();
    moveSubtask(handle.db, one.id, 'down');
    expect(titles(task.id)).toEqual(['three', 'one', 'two']);
  });

  it('leaves the order alone at either end', () => {
    const task = createTask(handle.db, { title: 'a' });
    const one = createSubtask(handle.db, { taskId: task.id, title: 'one' });
    const two = createSubtask(handle.db, { taskId: task.id, title: 'two' });
    clock.advance();
    expect(moveSubtask(handle.db, one.id, 'up').map((s) => s.title)).toEqual(['one', 'two']);
    expect(moveSubtask(handle.db, two.id, 'down').map((s) => s.title)).toEqual(['one', 'two']);
    expect(rawRow('subtasks', one.id)).toMatchObject({ updated_at: one.updatedAt });
  });

  it('renumbers legacy rows that share a sort order', () => {
    const task = createTask(handle.db, { title: 'a' });
    const one = createSubtask(handle.db, { taskId: task.id, title: 'one', sortOrder: 0 });
    const two = createSubtask(handle.db, { taskId: task.id, title: 'two', sortOrder: 0 });
    const [later, earlier] = one.id > two.id ? [one, two] : [two, one];
    moveSubtask(handle.db, later.id, 'up');
    expect(titles(task.id)).toEqual([later.title, earlier.title]);
  });

  it('skips deleted subtasks and rejects unknown ids and directions', () => {
    const task = createTask(handle.db, { title: 'a' });
    const one = createSubtask(handle.db, { taskId: task.id, title: 'one' });
    const gone = createSubtask(handle.db, { taskId: task.id, title: 'gone' });
    const three = createSubtask(handle.db, { taskId: task.id, title: 'three' });
    softDeleteSubtask(handle.db, gone.id);
    expect(moveSubtask(handle.db, three.id, 'up').map((s) => s.title)).toEqual(['three', 'one']);
    expect(() => moveSubtask(handle.db, gone.id, 'up')).toThrow('Subtask not found');
    expect(() => moveSubtask(handle.db, newId(), 'up')).toThrow('Subtask not found');
    expect(() => moveSubtask(handle.db, one.id, 'sideways' as 'up')).toThrow(ZodError);
  });

  it('refuses to change, move or delete a live subtask whose task is deleted', () => {
    const task = createTask(handle.db, { title: 'a' });
    const one = createSubtask(handle.db, { taskId: task.id, title: 'one' });
    createSubtask(handle.db, { taskId: task.id, title: 'two' });
    // softDeleteTask deletes the subtasks too; only the task row is deleted here (e.g. a sync
    // that deleted the task first), leaving its subtasks live.
    handle.sqlite.prepare('UPDATE tasks SET deleted_at = ? WHERE id = ?').run(clock.now(), task.id);
    const before = rawRow('subtasks', one.id);
    clock.advance();

    for (const write of [
      () => updateSubtask(handle.db, one.id, { isDone: true }),
      () => moveSubtask(handle.db, one.id, 'down'),
      () => softDeleteSubtask(handle.db, one.id),
    ]) {
      let error: unknown;
      try {
        write();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(RepoError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'Task not found' });
    }
    expect(rawRow('subtasks', one.id)).toEqual(before);
  });

  it(`caps a task at ${MAX_SUBTASKS_PER_TASK} live subtasks`, () => {
    const task = createTask(handle.db, { title: 'a' });
    const rows = Array.from({ length: MAX_SUBTASKS_PER_TASK }, (_, i) =>
      createSubtask(handle.db, { taskId: task.id, title: `s${i}` }),
    );
    let error: unknown;
    try {
      createSubtask(handle.db, { taskId: task.id, title: 'one too many' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RepoError);
    expect(error).toMatchObject({ code: 'LIMIT_REACHED' });
    // Deleted subtasks don't count.
    softDeleteSubtask(handle.db, rows[0]?.id ?? '');
    expect(createSubtask(handle.db, { taskId: task.id, title: 'fits again' }).sortOrder).toBe(
      MAX_SUBTASKS_PER_TASK,
    );
  });
});

describe('task-repo: restoreTask (TB-26 undo)', () => {
  it('restores the task with the subtasks and tag links deleted with it', () => {
    const task = createTask(handle.db, { title: 'a', priority: 2 });
    const kept = createSubtask(handle.db, { taskId: task.id, title: 'kept' });
    const earlier = createSubtask(handle.db, { taskId: task.id, title: 'deleted earlier' });
    clock.advance();
    softDeleteSubtask(handle.db, earlier.id);
    const tag = createTag(handle.db, { name: 'home' });
    addTagToTask(handle.db, task.id, tag.id);
    clock.advance();
    softDeleteTask(handle.db, task.id);
    const t2 = clock.advance();

    const restored = restoreTask(handle.db, task.id);

    expect(restored).toMatchObject({ id: task.id, deletedAt: null, updatedAt: t2, priority: 2 });
    expect(getTaskById(handle.db, task.id)).toEqual(restored);
    expect(listSubtasks(handle.db, task.id).map((s) => s.id)).toEqual([kept.id]);
    expect(rawRow('subtasks', kept.id)).toMatchObject({ deleted_at: null, updated_at: t2 });
    expect(listTagsForTask(handle.db, task.id).map((t) => t.id)).toEqual([tag.id]);
  });

  it('keeps links to a tag that was deleted meanwhile deleted', () => {
    const task = createTask(handle.db, { title: 'a' });
    const tag = createTag(handle.db, { name: 'home' });
    addTagToTask(handle.db, task.id, tag.id);
    clock.advance();
    softDeleteTask(handle.db, task.id);
    clock.advance();
    softDeleteTag(handle.db, tag.id);

    restoreTask(handle.db, task.id);

    expect(listTagsForTask(handle.db, task.id)).toEqual([]);
  });

  it('brings a task back to the Inbox when its list was deleted meanwhile', () => {
    const list = createList(handle.db, { name: 'Work' });
    const task = createTask(handle.db, { title: 'a', listId: list.id });
    softDeleteTask(handle.db, task.id);
    clock.advance();
    softDeleteList(handle.db, list.id);

    expect(restoreTask(handle.db, task.id).listId).toBeNull();
    expect(rawRow('tasks', task.id)).toMatchObject({ list_id: null, deleted_at: null });
  });

  it('keeps the list when it is still live', () => {
    const list = createList(handle.db, { name: 'Work' });
    const task = createTask(handle.db, { title: 'a', listId: list.id });
    softDeleteTask(handle.db, task.id);
    expect(restoreTask(handle.db, task.id).listId).toBe(list.id);
  });

  it('throws NOT_FOUND for an unknown or live task', () => {
    expect(() => restoreTask(handle.db, newId())).toThrow('Task not found');
    const task = createTask(handle.db, { title: 'a' });
    expect(() => restoreTask(handle.db, task.id)).toThrow(RepoError);
    expect(() => restoreTask(handle.db, 'not-an-id')).toThrow(ZodError);
  });
});

describe('task-repo: listCompletedTasks (TB-26)', () => {
  it('lists live done tasks, most recently completed first, bounded by limit', () => {
    const a = createTask(handle.db, { title: 'a' });
    const b = createTask(handle.db, { title: 'b' });
    const c = createTask(handle.db, { title: 'c' });
    createTask(handle.db, { title: 'open' });
    updateTask(handle.db, a.id, { status: 'done' });
    clock.advance();
    updateTask(handle.db, b.id, { status: 'done' });
    clock.advance();
    updateTask(handle.db, c.id, { status: 'done' });
    softDeleteTask(handle.db, c.id);

    expect(listCompletedTasks(handle.db).map((t) => t.title)).toEqual(['b', 'a']);
    expect(listCompletedTasks(handle.db, { limit: 1 }).map((t) => t.title)).toEqual(['b']);
    expect(() => listCompletedTasks(handle.db, { limit: 0 })).toThrow(ZodError);
  });
});

describe('task-repo: listUpcomingTimedTasks (TB-40 reminders)', () => {
  const at = (d: number, h = 0, min = 0) => new Date(2027, 0, d, h, min).getTime();

  it('lists live open tasks with a due time after `after`, soonest first, bounded by limit', () => {
    const now = at(10, 12);
    const later = createTask(handle.db, { title: 'later', dueAt: at(12, 9, 30) });
    const soon = createTask(handle.db, { title: 'soon', dueAt: at(10, 12, 1) });
    createTask(handle.db, { title: 'date only', dueAt: at(11) });
    createTask(handle.db, { title: 'no date' });
    createTask(handle.db, { title: 'past', dueAt: at(10, 11, 59) });
    createTask(handle.db, { title: 'exactly now', dueAt: now });
    const done = createTask(handle.db, { title: 'done', dueAt: at(11, 8) });
    updateTask(handle.db, done.id, { status: 'done' });
    const deleted = createTask(handle.db, { title: 'deleted', dueAt: at(11, 8) });
    softDeleteTask(handle.db, deleted.id);

    expect(listUpcomingTimedTasks(handle.db, { after: now, limit: 10 }).map((t) => t.id)).toEqual([
      soon.id,
      later.id,
    ]);
    expect(listUpcomingTimedTasks(handle.db, { after: now, limit: 1 }).map((t) => t.id)).toEqual([
      soon.id,
    ]);
    expect(() => listUpcomingTimedTasks(handle.db, { after: now, limit: 0 })).toThrow(ZodError);
  });

  it('reads past any number of date-only tasks to find timed ones', () => {
    for (let i = 0; i < 450; i += 1) createTask(handle.db, { title: `d${i}`, dueAt: at(2) });
    const timed = createTask(handle.db, { title: 'timed', dueAt: at(3, 10) });
    expect(listUpcomingTimedTasks(handle.db, { after: at(1), limit: 5 }).map((t) => t.id)).toEqual([
      timed.id,
    ]);
  });
});

describe('task-repo: persistence across restarts (TB-26 AC1)', () => {
  it('keeps a saved task with its due date and priority after the DB file is reopened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tb26-restart-'));
    try {
      const file = join(dir, 'taskbuddy.db');
      const first = openNodeDb(file);
      migrateNodeDb(first.db);
      const task = createTask(first.db, {
        title: 'Pay rent',
        dueAt: 1_800_000_000_000,
        priority: 3,
      });
      first.close();

      const second = openNodeDb(file);
      migrateNodeDb(second.db);
      expect(getTaskById(second.db, task.id)).toEqual(task);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
