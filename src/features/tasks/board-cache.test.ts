import { newId } from '@/lib/ids';

import { applyTaskPatch, insertTask, patchTask, removeTask } from './board-cache';
import type { Task } from './repo/task-repo';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: newId(),
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    listId: null,
    title: 'task',
    notes: null,
    status: 'open',
    priority: 0,
    dueAt: null,
    completedAt: null,
    sortOrder: 0,
    syncedUpdatedAt: null,
    ...overrides,
  };
}

describe('board cache', () => {
  it('inserts and removes tasks', () => {
    const a = task();
    const done = task({ status: 'done', completedAt: 5 });
    const board = insertTask({ open: [], completed: [done] }, a);
    expect(board.open).toEqual([a]);
    expect(removeTask(board, a.id)).toEqual({ open: [], completed: [done] });
    expect(removeTask(board, done.id)).toEqual({ open: [a], completed: [] });
  });

  it('applies the repository completion rules', () => {
    const a = task();
    const done = applyTaskPatch(a, { status: 'done' }, 10);
    expect(done).toMatchObject({ status: 'done', completedAt: 10, updatedAt: 10 });
    expect(applyTaskPatch(done, { status: 'done' }, 20).completedAt).toBe(10);
    expect(applyTaskPatch(done, { status: 'open' }, 30)).toMatchObject({ completedAt: null });
    expect(applyTaskPatch(a, { title: 'b', dueAt: undefined }, 40)).toMatchObject({
      title: 'b',
      dueAt: null,
    });
  });

  it('moves a task between open and completed', () => {
    const a = task();
    const b = task();
    const completed = patchTask({ open: [a, b], completed: [] }, a.id, { status: 'done' }, 10);
    expect(completed.open.map((t) => t.id)).toEqual([b.id]);
    expect(completed.completed[0]).toMatchObject({ id: a.id, completedAt: 10 });
    const reopened = patchTask(completed, a.id, { status: 'open' }, 20);
    expect(reopened.completed).toEqual([]);
    expect(reopened.open.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(patchTask(reopened, newId(), { title: 'x' }, 30)).toBe(reopened);
  });
});
