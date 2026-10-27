import { ZodError } from 'zod';

import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { newId } from '@/lib/ids';

import { RepoError } from './repo-utils';
import {
  addTagToTask,
  createTag,
  getTagById,
  listTags,
  listTagsForTask,
  removeTagFromTask,
  softDeleteTag,
  updateTag,
} from './tag-repo';
import { createTask, softDeleteTask } from './task-repo';
import { installTestClock } from './test-clock';

const clock = installTestClock();
let handle: NodeDb;
beforeEach(() => {
  handle = openMigratedNodeDb();
});
afterEach(() => handle.close());

function expectDuplicate(fn: () => unknown) {
  try {
    fn();
    throw new Error('expected a DUPLICATE RepoError');
  } catch (error) {
    expect(error).toBeInstanceOf(RepoError);
    expect((error as RepoError).code).toBe('DUPLICATE');
    // The message never echoes user content.
    expect((error as RepoError).message).toBe('A tag with this name already exists');
  }
}

describe('tag-repo: tags', () => {
  it('creates, lists (case-insensitive order) and updates tags', () => {
    const b = createTag(handle.db, { name: 'work' });
    const a = createTag(handle.db, { name: 'Errands', color: 'blue' });
    expect(a).toMatchObject({ name: 'Errands', color: 'blue', updatedAt: clock.now() });
    expect(listTags(handle.db).map((t) => t.name)).toEqual(['Errands', 'work']);
    const t1 = clock.advance();
    expect(updateTag(handle.db, b.id, { color: 'red' })).toMatchObject({
      name: 'work',
      color: 'red',
      updatedAt: t1,
    });
    expect(getTagById(handle.db, b.id)?.color).toBe('red');
  });

  it('rejects a duplicate name with different case', () => {
    createTag(handle.db, { name: 'Home' });
    expectDuplicate(() => createTag(handle.db, { name: 'hOME' }));
    expectDuplicate(() => createTag(handle.db, { name: '  home ' }));
  });

  it('rejects renaming onto another live tag, but allows a case change of itself', () => {
    createTag(handle.db, { name: 'Home' });
    const work = createTag(handle.db, { name: 'Work' });
    expectDuplicate(() => updateTag(handle.db, work.id, { name: 'HOME' }));
    expect(updateTag(handle.db, work.id, { name: 'WORK' }).name).toBe('WORK');
  });

  it('lets a soft-deleted tag name be re-created', () => {
    const old = createTag(handle.db, { name: 'Home' });
    expect(softDeleteTag(handle.db, old.id)).toBe(true);
    expect(softDeleteTag(handle.db, old.id)).toBe(false);
    const again = createTag(handle.db, { name: 'home' });
    expect(again.id).not.toBe(old.id);
    expect(listTags(handle.db).map((t) => t.id)).toEqual([again.id]);
  });

  it('backs the duplicate rule with the unique index', () => {
    createTag(handle.db, { name: 'Home' });
    expect(() =>
      handle.sqlite
        .prepare("INSERT INTO tags (id, created_at, updated_at, name) VALUES ('x', 1, 1, 'HOME')")
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it('validates input', () => {
    expect(() => createTag(handle.db, { name: ' ' })).toThrow(ZodError);
    expect(() => updateTag(handle.db, newId(), { name: 'x' })).toThrow('Tag not found');
  });
});

describe('tag-repo: task links', () => {
  it('links, lists and unlinks tags on a task', () => {
    const task = createTask(handle.db, { title: 'a' });
    const home = createTag(handle.db, { name: 'home' });
    const errands = createTag(handle.db, { name: 'Errands' });
    const link = addTagToTask(handle.db, task.id, home.id);
    addTagToTask(handle.db, task.id, errands.id);
    // Idempotent: the same live link is returned.
    expect(addTagToTask(handle.db, task.id, home.id).id).toBe(link.id);
    expect(listTagsForTask(handle.db, task.id).map((t) => t.name)).toEqual(['Errands', 'home']);

    const t1 = clock.advance();
    expect(removeTagFromTask(handle.db, task.id, home.id)).toBe(true);
    expect(removeTagFromTask(handle.db, task.id, home.id)).toBe(false);
    expect(
      handle.sqlite
        .prepare('SELECT deleted_at, updated_at FROM task_tags WHERE id = ?')
        .get(link.id),
    ).toEqual({ deleted_at: t1, updated_at: t1 });
    expect(listTagsForTask(handle.db, task.id).map((t) => t.name)).toEqual(['Errands']);
    // Re-adding after removal creates a new live link (the unique index ignores deleted rows).
    expect(addTagToTask(handle.db, task.id, home.id).id).not.toBe(link.id);
  });

  it('soft-deleting a tag soft-deletes its links', () => {
    const task = createTask(handle.db, { title: 'a' });
    const tag = createTag(handle.db, { name: 'home' });
    const link = addTagToTask(handle.db, task.id, tag.id);
    const t1 = clock.advance();
    softDeleteTag(handle.db, tag.id);
    expect(listTagsForTask(handle.db, task.id)).toEqual([]);
    expect(
      handle.sqlite.prepare('SELECT deleted_at FROM task_tags WHERE id = ?').get(link.id),
    ).toEqual({ deleted_at: t1 });
  });

  it('refuses links to missing or deleted tasks and tags', () => {
    const task = createTask(handle.db, { title: 'a' });
    const tag = createTag(handle.db, { name: 'home' });
    expect(() => addTagToTask(handle.db, newId(), tag.id)).toThrow('Task not found');
    expect(() => addTagToTask(handle.db, task.id, newId())).toThrow('Tag not found');
    softDeleteTask(handle.db, task.id);
    expect(() => addTagToTask(handle.db, task.id, tag.id)).toThrow('Task not found');
  });
});
