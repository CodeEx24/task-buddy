// TanStack Query keys for local task data (TB-26). Invalidate `all` after any task write.
export const taskQueryKeys = {
  all: ['tasks'] as const,
  board: () => ['tasks', 'board'] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
  /** A task's live subtasks, in checklist order (TB-28). */
  subtasks: (taskId: string) => ['tasks', 'subtasks', taskId] as const,
};

/** First page of open tasks the board loads. Pagination/virtualisation: TB-63. */
export const BOARD_OPEN_LIMIT = 500;
/** Most recent completed tasks the board shows. */
export const BOARD_COMPLETED_LIMIT = 100;
