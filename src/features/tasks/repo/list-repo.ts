// Local list repository (TB-21). Every write sets `updated_at`; deletes are soft.
import { and, asc, eq, isNull } from 'drizzle-orm';

import { lists, tasks, type ListRow } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { newId } from '@/lib/ids';

import {
  createListInputSchema,
  idSchema,
  updateListInputSchema,
  type CreateListInput,
  type UpdateListInput,
} from '../schema';
import { definedOnly, notFound } from './repo-utils';

export type List = ListRow;

function findLiveList(db: TaskBuddyDb, id: string): List | undefined {
  return db
    .select()
    .from(lists)
    .where(and(eq(lists.id, id), isNull(lists.deletedAt)))
    .get();
}

export function getListById(db: TaskBuddyDb, id: string): List | undefined {
  return findLiveList(db, idSchema.parse(id));
}

export function listLists(db: TaskBuddyDb): List[] {
  return db
    .select()
    .from(lists)
    .where(isNull(lists.deletedAt))
    .orderBy(asc(lists.sortOrder), asc(lists.id))
    .all();
}

export function createList(db: TaskBuddyDb, input: CreateListInput): List {
  const data = createListInputSchema.parse(input);
  const now = Date.now();
  const row: List = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: data.name,
    color: data.color ?? null,
    sortOrder: data.sortOrder ?? 0,
  };
  db.insert(lists).values(row).run();
  return row;
}

export function updateList(db: TaskBuddyDb, id: string, patch: UpdateListInput): List {
  const listId = idSchema.parse(id);
  const data = definedOnly(updateListInputSchema.parse(patch));
  return db.transaction((tx) => {
    const current = findLiveList(tx, listId);
    if (!current) throw notFound('List');
    const now = Date.now();
    tx.update(lists)
      .set({ ...data, updatedAt: now })
      .where(eq(lists.id, listId))
      .run();
    return { ...current, ...data, updatedAt: now };
  });
}

/**
 * Soft-deletes a list. Its tasks are not deleted: they move to the Inbox (`list_id = NULL`)
 * in the same transaction. Returns false when the list does not exist or is already deleted.
 */
export function softDeleteList(db: TaskBuddyDb, id: string): boolean {
  const listId = idSchema.parse(id);
  return db.transaction((tx) => {
    if (!findLiveList(tx, listId)) return false;
    const now = Date.now();
    // All tasks, including soft-deleted ones, so no row ever points at a deleted list.
    tx.update(tasks).set({ listId: null, updatedAt: now }).where(eq(tasks.listId, listId)).run();
    tx.update(lists).set({ deletedAt: now, updatedAt: now }).where(eq(lists.id, listId)).run();
    return true;
  });
}
