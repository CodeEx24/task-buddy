// Local task + subtask repository (TB-21). Every write sets `updated_at`; deletes are soft.
import { and, asc, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { lists, subtasks, tags, tasks, taskTags, type SubtaskRow, type TaskRow } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { newId } from '@/lib/ids';

import {
  createSubtaskInputSchema,
  createTaskInputSchema,
  idSchema,
  listCompletedTasksInputSchema,
  listOpenTasksInputSchema,
  updateSubtaskInputSchema,
  updateTaskInputSchema,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type ListCompletedTasksInput,
  type ListOpenTasksInput,
  type TaskCursor,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from '../schema';
import { definedOnly, notFound, guardDb } from './repo-utils';

export type Task = TaskRow;
export type Subtask = SubtaskRow;
export type TaskPage = { items: Task[]; nextCursor: TaskCursor | null };

function assertLiveList(db: TaskBuddyDb, listId: string): void {
  const row = db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .get();
  if (!row) throw notFound('List');
}

function findLiveTask(db: TaskBuddyDb, id: string): Task | undefined {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .get();
}

function getTaskByIdUnchecked(db: TaskBuddyDb, id: string): Task | undefined {
  return findLiveTask(db, idSchema.parse(id));
}

function createTaskUnchecked(db: TaskBuddyDb, input: CreateTaskInput): Task {
  const data = createTaskInputSchema.parse(input);
  return db.transaction((tx) => {
    if (data.listId) assertLiveList(tx, data.listId);
    const now = Date.now();
    const row: Task = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      listId: data.listId ?? null,
      title: data.title,
      notes: data.notes ?? null,
      status: 'open',
      priority: data.priority ?? 0,
      dueAt: data.dueAt ?? null,
      completedAt: null,
      sortOrder: data.sortOrder ?? 0,
    };
    tx.insert(tasks).values(row).run();
    return row;
  });
}

/** Updates a live task. Moving to `done` stamps `completed_at`; back to `open` clears it. */
function updateTaskUnchecked(db: TaskBuddyDb, id: string, patch: UpdateTaskInput): Task {
  const taskId = idSchema.parse(id);
  const data = definedOnly(updateTaskInputSchema.parse(patch));
  return db.transaction((tx) => {
    const current = findLiveTask(tx, taskId);
    if (!current) throw notFound('Task');
    // Nothing to change: no write, so updated_at (and a later sync push) is untouched.
    if (Object.keys(data).length === 0) return current;
    if (data.listId) assertLiveList(tx, data.listId);
    const now = Date.now();
    let completedAt = current.completedAt;
    if (data.status === 'done' && current.status !== 'done') completedAt = now;
    if (data.status === 'open') completedAt = null;
    const next: Task = { ...current, ...data, completedAt, updatedAt: now };
    tx.update(tasks)
      .set({ ...data, completedAt, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();
    return next;
  });
}

/**
 * Soft-deletes a live task with its live subtasks and tag links, in one transaction.
 * Returns false when the task does not exist or is already deleted.
 */
function softDeleteTaskUnchecked(db: TaskBuddyDb, id: string): boolean {
  const taskId = idSchema.parse(id);
  return db.transaction((tx) => {
    if (!findLiveTask(tx, taskId)) return false;
    const now = Date.now();
    const deleted = { deletedAt: now, updatedAt: now };
    tx.update(tasks).set(deleted).where(eq(tasks.id, taskId)).run();
    tx.update(subtasks)
      .set(deleted)
      .where(and(eq(subtasks.taskId, taskId), isNull(subtasks.deletedAt)))
      .run();
    tx.update(taskTags)
      .set(deleted)
      .where(and(eq(taskTags.taskId, taskId), isNull(taskTags.deletedAt)))
      .run();
    return true;
  });
}

/**
 * Undoes `softDeleteTask` (TB-26): un-deletes the task and the subtasks and tag links that were
 * deleted with it (same `deleted_at`). Tag links whose tag is no longer live stay deleted, and a
 * task whose list was deleted meanwhile comes back in the Inbox (`list_id = NULL`).
 * Throws NOT_FOUND when the id is unknown or the task is not deleted.
 */
function restoreTaskUnchecked(db: TaskBuddyDb, id: string): Task {
  const taskId = idSchema.parse(id);
  return db.transaction((tx) => {
    const current = tx.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!current || current.deletedAt === null) throw notFound('Task');
    const deletedAt = current.deletedAt;
    const listIsLive =
      current.listId === null ||
      tx
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.id, current.listId), isNull(lists.deletedAt)))
        .get() !== undefined;
    const now = Date.now();
    const restored = { deletedAt: null, updatedAt: now };
    const listId = listIsLive ? current.listId : null;
    tx.update(tasks)
      .set({ ...restored, listId })
      .where(eq(tasks.id, taskId))
      .run();
    tx.update(subtasks)
      .set(restored)
      .where(and(eq(subtasks.taskId, taskId), eq(subtasks.deletedAt, deletedAt)))
      .run();
    tx.update(taskTags)
      .set(restored)
      .where(
        and(
          eq(taskTags.taskId, taskId),
          eq(taskTags.deletedAt, deletedAt),
          sql`${taskTags.tagId} IN (SELECT ${tags.id} FROM ${tags} WHERE ${tags.deletedAt} IS NULL)`,
        ),
      )
      .run();
    return { ...current, ...restored, listId };
  });
}

/** Live completed tasks, most recently completed first (TB-26). Bounded by `limit`. */
function listCompletedTasksUnchecked(db: TaskBuddyDb, input: ListCompletedTasksInput = {}): Task[] {
  const { limit } = listCompletedTasksInputSchema.parse(input);
  return db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), eq(tasks.status, 'done')))
    .orderBy(desc(tasks.completedAt), desc(tasks.id))
    .limit(limit)
    .all();
}

/**
 * Live open tasks, ordered by `due_at` (nulls last), then `sort_order`, then `id`, keyset-paginated.
 * `listId` undefined = all lists, null = Inbox (no list). Runs as two index range scans on
 * `tasks_live_status_due_sort_idx`: dated tasks first, then undated ones.
 */
function listOpenTasksUnchecked(db: TaskBuddyDb, input: ListOpenTasksInput = {}): TaskPage {
  const { listId, limit, cursor } = listOpenTasksInputSchema.parse(input);
  const base: SQL[] = [isNull(tasks.deletedAt), eq(tasks.status, 'open')];
  if (listId !== undefined)
    base.push(listId === null ? isNull(tasks.listId) : eq(tasks.listId, listId));

  const items: Task[] = [];
  // Fetch one extra row to know whether another page exists.
  const want = limit + 1;

  if (!cursor || cursor.dueAt !== null) {
    const after = cursor
      ? sql`(${tasks.dueAt}, ${tasks.sortOrder}, ${tasks.id}) > (${cursor.dueAt}, ${cursor.sortOrder}, ${cursor.id})`
      : undefined;
    items.push(
      ...db
        .select()
        .from(tasks)
        .where(and(...base, isNotNull(tasks.dueAt), after))
        .orderBy(asc(tasks.dueAt), asc(tasks.sortOrder), asc(tasks.id))
        .limit(want)
        .all(),
    );
  }
  if (items.length < want) {
    const after =
      cursor && cursor.dueAt === null
        ? sql`(${tasks.sortOrder}, ${tasks.id}) > (${cursor.sortOrder}, ${cursor.id})`
        : undefined;
    items.push(
      ...db
        .select()
        .from(tasks)
        .where(and(...base, isNull(tasks.dueAt), after))
        .orderBy(asc(tasks.sortOrder), asc(tasks.id))
        .limit(want - items.length)
        .all(),
    );
  }

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor:
      hasMore && last ? { dueAt: last.dueAt, sortOrder: last.sortOrder, id: last.id } : null,
  };
}

// --- Subtasks ---

function findLiveSubtask(db: TaskBuddyDb, id: string): Subtask | undefined {
  return db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.id, id), isNull(subtasks.deletedAt)))
    .get();
}

function createSubtaskUnchecked(db: TaskBuddyDb, input: CreateSubtaskInput): Subtask {
  const data = createSubtaskInputSchema.parse(input);
  return db.transaction((tx) => {
    if (!findLiveTask(tx, data.taskId)) throw notFound('Task');
    const now = Date.now();
    const row: Subtask = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      taskId: data.taskId,
      title: data.title,
      isDone: false,
      sortOrder: data.sortOrder ?? 0,
    };
    tx.insert(subtasks).values(row).run();
    return row;
  });
}

function updateSubtaskUnchecked(db: TaskBuddyDb, id: string, patch: UpdateSubtaskInput): Subtask {
  const subtaskId = idSchema.parse(id);
  const data = definedOnly(updateSubtaskInputSchema.parse(patch));
  return db.transaction((tx) => {
    const current = findLiveSubtask(tx, subtaskId);
    if (!current) throw notFound('Subtask');
    // Nothing to change: no write, so updated_at (and a later sync push) is untouched.
    if (Object.keys(data).length === 0) return current;
    const now = Date.now();
    tx.update(subtasks)
      .set({ ...data, updatedAt: now })
      .where(eq(subtasks.id, subtaskId))
      .run();
    return { ...current, ...data, updatedAt: now };
  });
}

function softDeleteSubtaskUnchecked(db: TaskBuddyDb, id: string): boolean {
  const subtaskId = idSchema.parse(id);
  return db.transaction((tx) => {
    if (!findLiveSubtask(tx, subtaskId)) return false;
    const now = Date.now();
    tx.update(subtasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(subtasks.id, subtaskId))
      .run();
    return true;
  });
}

function listSubtasksUnchecked(db: TaskBuddyDb, taskId: string): Subtask[] {
  return db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.taskId, idSchema.parse(taskId)), isNull(subtasks.deletedAt)))
    .orderBy(asc(subtasks.sortOrder), asc(subtasks.id))
    .all();
}

// Public API: driver failures surface as RepoError('DB_FAILURE') without task data.
export const getTaskById = guardDb(getTaskByIdUnchecked);
export const createTask = guardDb(createTaskUnchecked);
export const updateTask = guardDb(updateTaskUnchecked);
export const softDeleteTask = guardDb(softDeleteTaskUnchecked);
export const restoreTask = guardDb(restoreTaskUnchecked);
export const listOpenTasks = guardDb(listOpenTasksUnchecked);
export const listCompletedTasks = guardDb(listCompletedTasksUnchecked);
export const createSubtask = guardDb(createSubtaskUnchecked);
export const updateSubtask = guardDb(updateSubtaskUnchecked);
export const softDeleteSubtask = guardDb(softDeleteSubtaskUnchecked);
export const listSubtasks = guardDb(listSubtasksUnchecked);
