import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';

import { getTaskById, listCompletedTasks, listOpenTasks, type Task } from '../repo/task-repo';
import type { TaskBoard } from '../task-sections';
import { BOARD_COMPLETED_LIMIT, BOARD_OPEN_LIMIT, taskQueryKeys } from './task-query-keys';

export function readTaskBoard(): TaskBoard {
  const db = getDb();
  return {
    open: listOpenTasks(db, { limit: BOARD_OPEN_LIMIT }).items,
    completed: listCompletedTasks(db, { limit: BOARD_COMPLETED_LIMIT }),
  };
}

/** Open and recently completed tasks from the local DB (TB-26). */
export function useTaskBoard() {
  return useQuery({ queryKey: taskQueryKeys.board(), queryFn: readTaskBoard });
}

/** One live task, or `null` when it doesn't exist or was deleted. */
export function useTask(id: string) {
  return useQuery<Task | null>({
    queryKey: taskQueryKeys.detail(id),
    queryFn: () => getTaskById(getDb(), id) ?? null,
  });
}
