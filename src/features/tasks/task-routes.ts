// Task route paths (TB-26), shared by every screen that links to the task modals.

/** The add-task modal (`src/app/task/new.tsx`). */
export const NEW_TASK_HREF = '/task/new' as const;

/** The task detail/edit modal (`src/app/task/[id].tsx`). */
export function taskHref(id: string): `/task/${string}` {
  return `/task/${id}`;
}
