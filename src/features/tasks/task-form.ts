// Add/edit task form contract (TB-26): what the form holds, how it validates, and how it maps to
// the repository inputs. Validation repeats the repository rules so errors show under the field;
// the repository still validates again at its own boundary.
import { z } from 'zod';

import { parseDateInput, toDateInput } from '@/lib/dates';

import type { Task } from './repo/task-repo';
import { MAX_TITLE_LENGTH, taskPrioritySchema } from './schema';

export const TITLE_REQUIRED_MESSAGE = 'Add a title';
export const TITLE_TOO_LONG_MESSAGE = `Keep the title under ${MAX_TITLE_LENGTH} characters`;
export const INVALID_DATE_MESSAGE = 'Use a real date as YYYY-MM-DD';

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, TITLE_REQUIRED_MESSAGE)
    .max(MAX_TITLE_LENGTH, TITLE_TOO_LONG_MESSAGE),
  /** `YYYY-MM-DD`, or empty for no due date. */
  dueDate: z
    .string()
    .trim()
    .refine((value) => value === '' || parseDateInput(value) !== null, INVALID_DATE_MESSAGE),
  priority: taskPrioritySchema,
});

export type TaskFormValues = z.input<typeof taskFormSchema>;
export type ParsedTaskForm = z.output<typeof taskFormSchema>;

/** What the form hands to create/update: the repository's own field names. */
export type TaskFields = { title: string; dueAt: number | null; priority: number };

export const EMPTY_TASK_FORM: TaskFormValues = { title: '', dueDate: '', priority: 0 };

/** Validated form output → repository fields. */
export function toTaskFields(values: ParsedTaskForm): TaskFields {
  return {
    title: values.title,
    dueAt: values.dueDate === '' ? null : parseDateInput(values.dueDate),
    priority: values.priority,
  };
}

/** A stored task → form values for editing. */
export function toTaskFormValues(task: Pick<Task, 'title' | 'dueAt' | 'priority'>): TaskFormValues {
  return {
    title: task.title,
    dueDate: task.dueAt === null ? '' : toDateInput(task.dueAt),
    priority: task.priority,
  };
}
