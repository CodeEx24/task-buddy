// Task route paths (TB-26), shared by every screen that links to the task modals.
import { z } from 'zod';

/** The add-task modal (`src/app/task/new.tsx`). */
export const NEW_TASK_HREF = '/task/new' as const;

/** The add-task modal with the due date preset to today (opened from the Today tab, TB-27). */
export const NEW_TODAY_TASK_HREF = { pathname: NEW_TASK_HREF, params: { due: 'today' } } as const;

/** The task detail/edit modal (`src/app/task/[id].tsx`). */
export function taskHref(id: string): `/task/${string}` {
  return `/task/${id}`;
}

const newTaskDueParamSchema = z.literal('today');

/** The `due` search param of `/task/new` (untrusted: any link can set it). Unknown → no preset. */
export function parseNewTaskDueParam(raw: string | string[] | undefined): 'today' | null {
  const result = newTaskDueParamSchema.safeParse(Array.isArray(raw) ? undefined : raw);
  return result.success ? result.data : null;
}
