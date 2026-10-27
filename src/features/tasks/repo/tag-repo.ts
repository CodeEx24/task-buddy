// Local tag repository (TB-21). Tag names are unique case-insensitively among live tags.
// Every write sets `updated_at`; deletes are soft.
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

import { tags, tasks, taskTags, type TagRow, type TaskTagRow } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { newId } from '@/lib/ids';

import {
  createTagInputSchema,
  idSchema,
  updateTagInputSchema,
  type CreateTagInput,
  type UpdateTagInput,
} from '../schema';
import { definedOnly, notFound, RepoError } from './repo-utils';

export type Tag = TagRow;
export type TaskTag = TaskTagRow;

const duplicateName = () => new RepoError('DUPLICATE', 'A tag with this name already exists');

function findLiveTag(db: TaskBuddyDb, id: string): Tag | undefined {
  return db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
    .get();
}

/** Same comparison as the `tags_name_live_unique` index: SQLite `lower()` on live rows. */
function assertNameFree(db: TaskBuddyDb, name: string, exceptId?: string): void {
  const clash = db
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        sql`lower(${tags.name}) = lower(${name})`,
        isNull(tags.deletedAt),
        exceptId ? ne(tags.id, exceptId) : undefined,
      ),
    )
    .get();
  if (clash) throw duplicateName();
}

export function getTagById(db: TaskBuddyDb, id: string): Tag | undefined {
  return findLiveTag(db, idSchema.parse(id));
}

export function listTags(db: TaskBuddyDb): Tag[] {
  return db
    .select()
    .from(tags)
    .where(isNull(tags.deletedAt))
    .orderBy(asc(sql`lower(${tags.name})`), asc(tags.id))
    .all();
}

export function createTag(db: TaskBuddyDb, input: CreateTagInput): Tag {
  const data = createTagInputSchema.parse(input);
  return db.transaction((tx) => {
    assertNameFree(tx, data.name);
    const now = Date.now();
    const row: Tag = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: data.name,
      color: data.color ?? null,
    };
    tx.insert(tags).values(row).run();
    return row;
  });
}

export function updateTag(db: TaskBuddyDb, id: string, patch: UpdateTagInput): Tag {
  const tagId = idSchema.parse(id);
  const data = definedOnly(updateTagInputSchema.parse(patch));
  return db.transaction((tx) => {
    const current = findLiveTag(tx, tagId);
    if (!current) throw notFound('Tag');
    if (data.name !== undefined) assertNameFree(tx, data.name, tagId);
    const now = Date.now();
    tx.update(tags)
      .set({ ...data, updatedAt: now })
      .where(eq(tags.id, tagId))
      .run();
    return { ...current, ...data, updatedAt: now };
  });
}

/** Soft-deletes a tag and its live task links in one transaction. */
export function softDeleteTag(db: TaskBuddyDb, id: string): boolean {
  const tagId = idSchema.parse(id);
  return db.transaction((tx) => {
    if (!findLiveTag(tx, tagId)) return false;
    const now = Date.now();
    const deleted = { deletedAt: now, updatedAt: now };
    tx.update(taskTags)
      .set(deleted)
      .where(and(eq(taskTags.tagId, tagId), isNull(taskTags.deletedAt)))
      .run();
    tx.update(tags).set(deleted).where(eq(tags.id, tagId)).run();
    return true;
  });
}

/** Links a live tag to a live task. Idempotent: returns the existing live link if present. */
export function addTagToTask(db: TaskBuddyDb, taskId: string, tagId: string): TaskTag {
  const ids = { taskId: idSchema.parse(taskId), tagId: idSchema.parse(tagId) };
  return db.transaction((tx) => {
    const task = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, ids.taskId), isNull(tasks.deletedAt)))
      .get();
    if (!task) throw notFound('Task');
    if (!findLiveTag(tx, ids.tagId)) throw notFound('Tag');
    const existing = tx
      .select()
      .from(taskTags)
      .where(
        and(
          eq(taskTags.taskId, ids.taskId),
          eq(taskTags.tagId, ids.tagId),
          isNull(taskTags.deletedAt),
        ),
      )
      .get();
    if (existing) return existing;
    const now = Date.now();
    const row: TaskTag = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, ...ids };
    tx.insert(taskTags).values(row).run();
    return row;
  });
}

/** Soft-deletes the live link between a task and a tag. Returns false if there was none. */
export function removeTagFromTask(db: TaskBuddyDb, taskId: string, tagId: string): boolean {
  const ids = { taskId: idSchema.parse(taskId), tagId: idSchema.parse(tagId) };
  const now = Date.now();
  const result = db
    .update(taskTags)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(taskTags.taskId, ids.taskId),
        eq(taskTags.tagId, ids.tagId),
        isNull(taskTags.deletedAt),
      ),
    )
    .returning({ id: taskTags.id })
    .all();
  return result.length > 0;
}

export function listTagsForTask(db: TaskBuddyDb, taskId: string): Tag[] {
  return db
    .select({
      id: tags.id,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
      deletedAt: tags.deletedAt,
      name: tags.name,
      color: tags.color,
    })
    .from(taskTags)
    .innerJoin(tags, eq(taskTags.tagId, tags.id))
    .where(
      and(
        eq(taskTags.taskId, idSchema.parse(taskId)),
        isNull(taskTags.deletedAt),
        isNull(tags.deletedAt),
      ),
    )
    .orderBy(asc(sql`lower(${tags.name})`), asc(tags.id))
    .all();
}
