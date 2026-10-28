// TanStack Query keys for local task data (TB-26). Invalidate `all` after any task write.
export const taskQueryKeys = {
  all: ['tasks'] as const,
  board: () => ['tasks', 'board'] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
};

/** First page of open tasks the board loads. Pagination/virtualisation: TB-63. */
export const BOARD_OPEN_LIMIT = 500;
/** Most recent completed tasks the board shows. */
export const BOARD_COMPLETED_LIMIT = 100;
