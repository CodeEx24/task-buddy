// Add/edit task form contract (TB-26, notes since TB-28, due time since TB-40): what the form holds, how it validates,
// and how it maps to the repository inputs. Validation repeats the repository rules so errors show under the field;
// the repository still validates again at its own boundary.
import { z } from 'zod';

import {
  atLocalTime,
  hasTimeOfDay,
  parseDateInput,
  parseTimeInput,
  toDateInput,
  toTimeInput,
} from '@/lib/dates';

import type { Task } from './repo/task-repo';
import { MAX_NOTES_LENGTH, MAX_TITLE_LENGTH, taskPrioritySchema } from './schema';

export const TITLE_REQUIRED_MESSAGE = 'Add a title';
export const TITLE_TOO_LONG_MESSAGE = `Use at most ${MAX_TITLE_LENGTH} characters`;
export const INVALID_DATE_MESSAGE = 'Use a real date as YYYY-MM-DD';
export const INVALID_TIME_MESSAGE = 'Use a 24-hour time as HH:MM';
export const MIDNIGHT_TIME_MESSAGE = '00:00 means no time. Use 00:01 or later';
export const TIME_NEEDS_DATE_MESSAGE = 'Pick a due date for this time';
export const NOTES_TOO_LONG_MESSAGE = `Use at most ${MAX_NOTES_LENGTH.toLocaleString('en-US')} characters`;

export const taskFormSchema = z
  .object({
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
    /**
     * TB-40: `HH:MM` (24-hour), or empty for a date-only due date. A due time gets a reminder.
     * 00:00 is refused: a date-only due date is stored as local midnight (spec D1).
     */
    dueTime: z
      .string()
      .trim()
      .default('')
      .superRefine((value, ctx) => {
        if (value === '') return;
        const minutes = parseTimeInput(value);
        if (minutes === null) ctx.addIssue({ code: 'custom', message: INVALID_TIME_MESSAGE });
        else if (minutes === 0) ctx.addIssue({ code: 'custom', message: MIDNIGHT_TIME_MESSAGE });
      }),
    priority: taskPrioritySchema,
    /** Free text, kept as typed; blank means no notes. */
    notes: z.string().max(MAX_NOTES_LENGTH, NOTES_TOO_LONG_MESSAGE),
  })
  .superRefine((values, ctx) => {
    if (values.dueTime !== '' && values.dueDate === '') {
      ctx.addIssue({ code: 'custom', path: ['dueTime'], message: TIME_NEEDS_DATE_MESSAGE });
    }
  });

export type TaskFormValues = z.input<typeof taskFormSchema>;
export type ParsedTaskForm = z.output<typeof taskFormSchema>;

/** What the form hands to create/update: the repository's own field names. */
export type TaskFields = {
  title: string;
  dueAt: number | null;
  priority: number;
  notes: string | null;
};

export const EMPTY_TASK_FORM: TaskFormValues = {
  title: '',
  dueDate: '',
  dueTime: '',
  priority: 0,
  notes: '',
};

/** Due date + optional time → `due_at`: local midnight without a time (TB-40, spec D1). */
function toDueAt(dueDate: string, dueTime: string): number | null {
  if (dueDate === '') return null;
  const day = parseDateInput(dueDate);
  if (day === null) return null;
  const minutes = dueTime === '' ? null : parseTimeInput(dueTime);
  return minutes === null ? day : atLocalTime(day, minutes);
}

/** Validated form output → repository fields. */
export function toTaskFields(values: ParsedTaskForm): TaskFields {
  return {
    title: values.title,
    dueAt: toDueAt(values.dueDate, values.dueTime),
    priority: values.priority,
    notes: values.notes.trim() === '' ? null : values.notes,
  };
}

type EditableTask = Pick<Task, 'title' | 'dueAt' | 'priority' | 'notes'>;

/** A stored task → form values for editing. */
export function toTaskFormValues(task: EditableTask): TaskFormValues {
  return {
    title: task.title,
    dueDate: task.dueAt === null ? '' : toDateInput(task.dueAt),
    dueTime: task.dueAt !== null && hasTimeOfDay(task.dueAt) ? toTimeInput(task.dueAt) : '',
    priority: task.priority,
    notes: task.notes ?? '',
  };
}

/**
 * The fields of `fields` that differ from the stored task (TB-28 autosave): an empty object means
 * there is nothing to save.
 */
export function changedTaskFields(fields: TaskFields, task: EditableTask): Partial<TaskFields> {
  const patch: Partial<TaskFields> = {};
  if (fields.title !== task.title) patch.title = fields.title;
  if (fields.dueAt !== task.dueAt) patch.dueAt = fields.dueAt;
  if (fields.priority !== task.priority) patch.priority = fields.priority;
  if (fields.notes !== task.notes) patch.notes = fields.notes;
  return patch;
}

export const SUBTASK_TITLE_REQUIRED_MESSAGE = 'Type a step first';

/** The add-a-step field on the task detail screen (TB-28). Same limits as a task title. */
export const subtaskTitleSchema = z
  .string()
  .trim()
  .min(1, SUBTASK_TITLE_REQUIRED_MESSAGE)
  .max(MAX_TITLE_LENGTH, TITLE_TOO_LONG_MESSAGE);
