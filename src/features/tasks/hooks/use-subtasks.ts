// A task's subtask checklist (TB-28): the query plus add / check / move / delete, each optimistic
// like the task mutations (TB-26). The cached list changes first, the repository writes, an error
// rolls the list back, and the list is refetched from SQLite when the write settles.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { newId } from '@/lib/ids';

import {
  createSubtask,
  listSubtasks,
  moveSubtask,
  softDeleteSubtask,
  updateSubtask,
  type Subtask,
} from '../repo/task-repo';
import type { SubtaskMoveDirection } from '../schema';
import { taskQueryKeys } from './task-query-keys';

/** Live subtasks of a task, in checklist order. */
export function useSubtasks(taskId: string) {
  return useQuery<Subtask[]>({
    queryKey: taskQueryKeys.subtasks(taskId),
    queryFn: () => listSubtasks(getDb(), taskId),
  });
}

/** The checklist with `id` moved one place up or down (same rule as `moveSubtask`). */
export function moveInList(
  list: readonly Subtask[],
  id: string,
  direction: SubtaskMoveDirection,
): Subtask[] {
  const from = list.findIndex((s) => s.id === id);
  const to = from + (direction === 'up' ? -1 : 1);
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[from], next[to]] = [next[to] as Subtask, next[from] as Subtask];
  return next;
}

type Snapshot = { list: Subtask[] | undefined };

/**
 * One optimistic subtask mutation: `change` edits the cached list before `write` runs.
 * The hook owns the cache key, so every mutation below stays a one-liner.
 */
function useSubtaskMutation<TVariables, TResult>(
  taskId: string,
  write: (variables: TVariables) => TResult,
  change: (list: Subtask[], variables: TVariables) => Subtask[],
) {
  const client = useQueryClient();
  const key = taskQueryKeys.subtasks(taskId);
  return useMutation<TResult, Error, TVariables, Snapshot>({
    mutationFn: async (variables) => write(variables),
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: key });
      const list = client.getQueryData<Subtask[]>(key);
      if (list) client.setQueryData(key, change(list, variables));
      return { list };
    },
    onError: (_error, _variables, snapshot) => {
      if (snapshot?.list) client.setQueryData(key, snapshot.list);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useSubtaskMutations(taskId: string) {
  const add = useSubtaskMutation(
    taskId,
    (title: string) => createSubtask(getDb(), { taskId, title }),
    (list, title) => {
      const now = Date.now();
      const last = list[list.length - 1];
      const placeholder: Subtask = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        taskId,
        title: title.trim(),
        isDone: false,
        sortOrder: last ? Math.floor(last.sortOrder) + 1 : 0,
        syncedUpdatedAt: null,
      };
      return [...list, placeholder];
    },
  );
  const setDone = useSubtaskMutation(
    taskId,
    ({ id, isDone }: { id: string; isDone: boolean }) => updateSubtask(getDb(), id, { isDone }),
    (list, { id, isDone }) => list.map((s) => (s.id === id ? { ...s, isDone } : s)),
  );
  const move = useSubtaskMutation(
    taskId,
    ({ id, direction }: { id: string; direction: SubtaskMoveDirection }) =>
      moveSubtask(getDb(), id, direction),
    (list, { id, direction }) => moveInList(list, id, direction),
  );
  const remove = useSubtaskMutation(
    taskId,
    (id: string) => softDeleteSubtask(getDb(), id),
    (list, id) => list.filter((s) => s.id !== id),
  );
  return { add, setDone, move, remove };
}
