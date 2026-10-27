// Local SQLite schema (TB-21). The schema is a contract shared with the future sync (TB-43):
// every table carries a UUIDv7 `id`, `created_at`, `updated_at` and `deleted_at` (soft delete).
// Timestamps are integer epoch milliseconds, UTC.
//
// After a release, never edit a shipped migration: change this file and run `pnpm db:generate`
// to fix forward with a new migration.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Columns every synced table carries. */
function syncColumns() {
  return {
    id: text('id').primaryKey(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'number' }),
  };
}

export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const lists = sqliteTable('lists', {
  ...syncColumns(),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: real('sort_order').notNull().default(0),
});

export const tasks = sqliteTable(
  'tasks',
  {
    ...syncColumns(),
    listId: text('list_id').references(() => lists.id),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('open'),
    priority: integer('priority', { mode: 'number' }).notNull().default(0),
    dueAt: integer('due_at', { mode: 'number' }),
    completedAt: integer('completed_at', { mode: 'number' }),
    sortOrder: real('sort_order').notNull().default(0),
  },
  (t) => [
    // DB-level guards that match the Zod input schemas, so bad rows fail even outside the repos.
    check('tasks_status_check', sql`${t.status} IN ('open', 'done')`),
    check('tasks_priority_check', sql`${t.priority} BETWEEN 0 AND 3`),
    // Main list query: live + open, ordered by due date then manual order (migration 0001).
    index('tasks_live_status_due_sort_idx').on(t.deletedAt, t.status, t.dueAt, t.sortOrder),
    index('tasks_list_id_idx').on(t.listId),
  ],
);

export const subtasks = sqliteTable(
  'subtasks',
  {
    ...syncColumns(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    title: text('title').notNull(),
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    sortOrder: real('sort_order').notNull().default(0),
  },
  (t) => [index('subtasks_task_id_idx').on(t.taskId)],
);

export const tags = sqliteTable(
  'tags',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    color: text('color'),
  },
  (t) => [
    // Case-insensitive unique name among live tags; a soft-deleted tag can be re-created.
    uniqueIndex('tags_name_live_unique')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const taskTags = sqliteTable(
  'task_tags',
  {
    ...syncColumns(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => [
    uniqueIndex('task_tags_task_tag_live_unique')
      .on(t.taskId, t.tagId)
      .where(sql`${t.deletedAt} IS NULL`),
    index('task_tags_tag_id_idx').on(t.tagId),
  ],
);

export type ListRow = typeof lists.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type SubtaskRow = typeof subtasks.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type TaskTagRow = typeof taskTags.$inferSelect;
