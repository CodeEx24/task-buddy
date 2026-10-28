// Repository-boundary validation for local task data (TB-21). Everything written to SQLite
// passes through one of these schemas first.
import { z } from 'zod';

import { TASK_STATUSES } from '@/db/schema';

export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 10_000;
export const MAX_NAME_LENGTH = 100;
export const MAX_COLOR_LENGTH = 32;
export const MAX_PAGE_SIZE = 500;

/** Row ids are UUIDv7 (see `newId`). */
export const idSchema = z.uuidv7();
/** Epoch milliseconds, UTC. */
const epochMsSchema = z.number().int().nonnegative().max(8_640_000_000_000_000);
const sortOrderSchema = z.number().finite();
const titleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const colorSchema = z.string().trim().min(1).max(MAX_COLOR_LENGTH).nullable();

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.number().int().min(0).max(3);

export const createTaskInputSchema = z.object({
  title: titleSchema,
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
  listId: idSchema.nullable().optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: epochMsSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});
export type CreateTaskInput = z.input<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z
  .object({
    title: titleSchema,
    notes: z.string().max(MAX_NOTES_LENGTH).nullable(),
    listId: idSchema.nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    dueAt: epochMsSchema.nullable(),
    sortOrder: sortOrderSchema,
  })
  .partial();
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;

/** Keyset cursor: the sort key of the last row of the previous page. */
export const taskCursorSchema = z.object({
  dueAt: epochMsSchema.nullable(),
  sortOrder: sortOrderSchema,
  id: idSchema,
});
export type TaskCursor = z.infer<typeof taskCursorSchema>;

export const listOpenTasksInputSchema = z.object({
  listId: idSchema.nullable().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(100),
  cursor: taskCursorSchema.nullable().optional(),
});
export type ListOpenTasksInput = z.input<typeof listOpenTasksInputSchema>;

export const listCompletedTasksInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(100),
});
export type ListCompletedTasksInput = z.input<typeof listCompletedTasksInputSchema>;

export const createSubtaskInputSchema = z.object({
  taskId: idSchema,
  title: titleSchema,
  sortOrder: sortOrderSchema.optional(),
});
export type CreateSubtaskInput = z.input<typeof createSubtaskInputSchema>;

export const updateSubtaskInputSchema = z
  .object({ title: titleSchema, isDone: z.boolean(), sortOrder: sortOrderSchema })
  .partial();
export type UpdateSubtaskInput = z.input<typeof updateSubtaskInputSchema>;

export const createListInputSchema = z.object({
  name: nameSchema,
  color: colorSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});
export type CreateListInput = z.input<typeof createListInputSchema>;

export const updateListInputSchema = z
  .object({ name: nameSchema, color: colorSchema, sortOrder: sortOrderSchema })
  .partial();
export type UpdateListInput = z.input<typeof updateListInputSchema>;

export const createTagInputSchema = z.object({ name: nameSchema, color: colorSchema.optional() });
export type CreateTagInput = z.input<typeof createTagInputSchema>;

export const updateTagInputSchema = z.object({ name: nameSchema, color: colorSchema }).partial();
export type UpdateTagInput = z.input<typeof updateTagInputSchema>;
