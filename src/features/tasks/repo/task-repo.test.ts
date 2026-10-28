import { ZodError } from 'zod';

import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { newId } from '@/lib/ids';

import { MAX_NOTES_LENGTH, MAX_TITLE_LENGTH } from '../schema';
import { createList, softDeleteList } from './list-repo';
import { RepoError } from './repo-utils';
import { addTagToTask, createTag } from './tag-repo';
import {
  createSubtask,
  createTask,
  getTaskById,
  listOpenTasks,
  listSubtasks,
  softDeleteSubtask,
  softDeleteTask,
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
