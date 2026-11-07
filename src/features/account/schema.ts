// Data export file format (TB-53, https://stratyge.atlassian.net/browse/TB-53). Versioned so a
// later import or a support tool can read old files: bump `DATA_EXPORT_VERSION` on any breaking
// change and keep the old schema. Dates are ISO 8601 strings (UTC) except `dueDate`, which is the
// local calendar date the user picked (`YYYY-MM-DD`), as due dates are date-only (TB-26).
import { z } from 'zod';

export const DATA_EXPORT_FORMAT = 'task-buddy-export';
export const DATA_EXPORT_VERSION = 1;

const isoDate = z.iso.datetime();

export const exportedSubtaskSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  isDone: z.boolean(),
  sortOrder: z.number(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const exportedTaskSchema = z.strictObject({
  id: z.string(),
  /** null = Inbox. */
  listId: z.string().nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.enum(['open', 'done']),
  /** 0 None, 1 Low, 2 Medium, 3 High. */
  priority: z.number().int().min(0).max(3),
  dueDate: z.iso.date().nullable(),
  completedAt: isoDate.nullable(),
  sortOrder: z.number(),
  createdAt: isoDate,
  updatedAt: isoDate,
  /** Names of the task's tags. */
  tags: z.array(z.string()),
  subtasks: z.array(exportedSubtaskSchema),
});

export const exportedListSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const exportedTagSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});

export const dataExportSchema = z.strictObject({
  format: z.literal(DATA_EXPORT_FORMAT),
  version: z.literal(DATA_EXPORT_VERSION),
  exportedAt: isoDate,
  app: z.string(),
  counts: z.strictObject({
    lists: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
    subtasks: z.number().int().nonnegative(),
    tags: z.number().int().nonnegative(),
  }),
  lists: z.array(exportedListSchema),
  tasks: z.array(exportedTaskSchema),
  tags: z.array(exportedTagSchema),
});

export type DataExport = z.infer<typeof dataExportSchema>;
export type ExportedTask = z.infer<typeof exportedTaskSchema>;
