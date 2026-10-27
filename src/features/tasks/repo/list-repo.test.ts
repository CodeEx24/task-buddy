import { ZodError } from 'zod';

import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { newId } from '@/lib/ids';

import { createList, getListById, listLists, softDeleteList, updateList } from './list-repo';
import { createTask, getTaskById, softDeleteTask } from './task-repo';
import { installTestClock } from './test-clock';

const clock = installTestClock();
let handle: NodeDb;
beforeEach(() => {
  handle = openMigratedNodeDb();
});
afterEach(() => handle.close());

const rawTask = (id: string) =>
  handle.sqlite.prepare('SELECT list_id, updated_at, deleted_at FROM tasks WHERE id = ?').get(id);

describe('list-repo', () => {
  it('creates, reads, orders and updates lists', () => {
    const b = createList(handle.db, { name: ' Work ', sortOrder: 2, color: '#ff0000' });
    const a = createList(handle.db, { name: 'Home', sortOrder: 1 });
    expect(b).toMatchObject({ name: 'Work', color: '#ff0000', updatedAt: clock.now() });
    expect(getListById(handle.db, a.id)).toEqual(a);
    expect(listLists(handle.db).map((l) => l.name)).toEqual(['Home', 'Work']);

    const t1 = clock.advance();
    const renamed = updateList(handle.db, b.id, { name: 'Job', color: null });
    expect(renamed).toMatchObject({ name: 'Job', color: null, updatedAt: t1 });
    expect(getListById(handle.db, b.id)).toEqual(renamed);
  });

  it('validates input', () => {
    expect(() => createList(handle.db, { name: '' })).toThrow(ZodError);
    expect(() => createList(handle.db, { name: 'x'.repeat(101) })).toThrow(ZodError);
    expect(() => updateList(handle.db, newId(), { name: 'x' })).toThrow('List not found');
  });

  it('soft-deletes a list and moves its tasks to the Inbox in the same transaction', () => {
    const list = createList(handle.db, { name: 'Work' });
    const other = createList(handle.db, { name: 'Home' });
    const live = createTask(handle.db, { title: 'live', listId: list.id });
    const gone = createTask(handle.db, { title: 'gone', listId: list.id });
    const elsewhere = createTask(handle.db, { title: 'elsewhere', listId: other.id });
    softDeleteTask(handle.db, gone.id);
    const t1 = clock.advance();

    expect(softDeleteList(handle.db, list.id)).toBe(true);

    expect(getListById(handle.db, list.id)).toBeUndefined();
    expect(listLists(handle.db).map((l) => l.id)).toEqual([other.id]);
    // The task survives, now in the Inbox, stamped with the same write time.
    expect(getTaskById(handle.db, live.id)).toMatchObject({ listId: null, updatedAt: t1 });
    expect(rawTask(gone.id)).toMatchObject({ list_id: null, updated_at: t1 });
    expect(rawTask(elsewhere.id)).toMatchObject({ list_id: other.id });
    // The list row is kept (soft delete) and stamped.
    expect(
      handle.sqlite.prepare('SELECT deleted_at, updated_at FROM lists WHERE id = ?').get(list.id),
    ).toEqual({ deleted_at: t1, updated_at: t1 });
    expect(softDeleteList(handle.db, list.id)).toBe(false);
  });

  it('rolls back the whole delete when a step fails', () => {
    const list = createList(handle.db, { name: 'Work' });
    const task = createTask(handle.db, { title: 'a', listId: list.id });
    // Make the second statement (UPDATE lists) fail after the tasks were already moved.
    handle.sqlite.exec(
      "CREATE TRIGGER fail_list_delete BEFORE UPDATE ON lists BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    expect(() => softDeleteList(handle.db, list.id)).toThrow();
    expect(getTaskById(handle.db, task.id)?.listId).toBe(list.id);
    expect(getListById(handle.db, list.id)).toBeDefined();
  });
});
