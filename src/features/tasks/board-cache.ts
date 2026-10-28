// Pure updates of the cached task board, used for optimistic UI (TB-26). They mirror what the
// repository will write, so the list changes before the SQLite write lands; the board is then
// refetched from the DB, which always wins.
import type { Task } from './repo/task-repo';
import type { UpdateTaskInput } from './schema';
import type { TaskBoard } from './task-sections';

export function insertTask(board: TaskBoard, task: Task): TaskBoard {
  return { ...board, open: [...board.open, task] };
}

export function removeTask(board: TaskBoard, id: string): TaskBoard {
  return {
    open: board.open.filter((t) => t.id !== id),
    completed: board.completed.filter((t) => t.id !== id),
  };
}

/** Same rules as `updateTask`: done stamps `completedAt` (once), open clears it. */
export function applyTaskPatch(task: Task, patch: UpdateTaskInput, now: number): Task {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<Task>;
  let completedAt = task.completedAt;
  if (patch.status === 'done' && task.status !== 'done') completedAt = now;
  if (patch.status === 'open') completedAt = null;
  return { ...task, ...defined, completedAt, updatedAt: now };
}

/** Applies a patch to the task wherever it is, moving it between open and completed. */
export function patchTask(
  board: TaskBoard,
  id: string,
  patch: UpdateTaskInput,
  now: number,
): TaskBoard {
  const current = [...board.open, ...board.completed].find((t) => t.id === id);
  if (!current) return board;
  const next = applyTaskPatch(current, patch, now);
  const rest = removeTask(board, id);
  return next.status === 'done'
    ? { ...rest, completed: [next, ...rest.completed] }
    : { ...rest, open: [...rest.open, next] };
}
