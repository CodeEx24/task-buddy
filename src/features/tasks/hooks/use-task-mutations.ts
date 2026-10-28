// Task writes with optimistic updates (TB-26). Each mutation updates the cached board first, then
// writes through the repository, rolls back on error, and refetches every task query when done.
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { newId } from '@/lib/ids';
import { useUndoStore } from '@/stores/undo-store';

import { applyTaskPatch, insertTask, patchTask, removeTask } from '../board-cache';
import { createTask, restoreTask, softDeleteTask, updateTask, type Task } from '../repo/task-repo';
import type { UpdateTaskInput } from '../schema';
import type { TaskFields } from '../task-form';
import type { TaskBoard } from '../task-sections';
import { taskQueryKeys } from './task-query-keys';

type Snapshot = { board: TaskBoard | undefined; detail?: { id: string; task: Task | null } };

/** Pauses in-flight reads, snapshots the cache, then applies `change` to the board. */
async function optimisticBoard(
  client: QueryClient,
  change: (board: TaskBoard) => TaskBoard,
): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: taskQueryKeys.all });
  const board = client.getQueryData<TaskBoard>(taskQueryKeys.board());
  if (board) client.setQueryData(taskQueryKeys.board(), change(board));
  return { board };
}

function rollback(client: QueryClient, snapshot: Snapshot | undefined) {
  if (!snapshot) return;
  client.setQueryData(taskQueryKeys.board(), snapshot.board);
  if (snapshot.detail) {
    client.setQueryData(taskQueryKeys.detail(snapshot.detail.id), snapshot.detail.task);
  }
}

function refetchTasks(client: QueryClient) {
  return client.invalidateQueries({ queryKey: taskQueryKeys.all });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation<Task, Error, TaskFields, Snapshot>({
    mutationFn: async (fields) => createTask(getDb(), fields),
    onMutate: (fields) => {
      const now = Date.now();
      const placeholder: Task = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        listId: null,
        title: fields.title,
        notes: null,
        status: 'open',
        priority: fields.priority,
        dueAt: fields.dueAt,
        completedAt: null,
        sortOrder: 0,
      };
      return optimisticBoard(client, (board) => insertTask(board, placeholder));
    },
    onError: (_error, _fields, snapshot) => rollback(client, snapshot),
    onSettled: () => refetchTasks(client),
  });
}

export type UpdateTaskVariables = { id: string; patch: UpdateTaskInput };

/** Edits fields and completes / un-completes (`patch.status`). */
export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation<Task, Error, UpdateTaskVariables, Snapshot>({
    mutationFn: async ({ id, patch }) => updateTask(getDb(), id, patch),
    onMutate: async ({ id, patch }) => {
      const now = Date.now();
      const snapshot = await optimisticBoard(client, (board) => patchTask(board, id, patch, now));
      const detail = client.getQueryData<Task | null>(taskQueryKeys.detail(id));
      if (detail) {
        client.setQueryData(taskQueryKeys.detail(id), applyTaskPatch(detail, patch, now));
        return { ...snapshot, detail: { id, task: detail } };
      }
      return snapshot;
    },
    onError: (_error, _variables, snapshot) => rollback(client, snapshot),
    onSettled: () => refetchTasks(client),
  });
}

/** Soft-deletes a task, then offers Undo for 5 seconds (AC3). */
export function useDeleteTask() {
  const client = useQueryClient();
  const offerUndo = useUndoStore((state) => state.offerUndo);
  return useMutation<boolean, Error, string, Snapshot>({
    mutationFn: async (id) => softDeleteTask(getDb(), id),
    onMutate: (id) => optimisticBoard(client, (board) => removeTask(board, id)),
    onSuccess: (deleted, id) => {
      if (deleted) offerUndo(id);
    },
    onError: (_error, _id, snapshot) => rollback(client, snapshot),
    onSettled: () => refetchTasks(client),
  });
}

/** Undo of `useDeleteTask`: restores the task and hides the snackbar. */
export function useRestoreTask() {
  const client = useQueryClient();
  const dismissUndo = useUndoStore((state) => state.dismissUndo);
  return useMutation<Task, Error, string>({
    mutationFn: async (id) => restoreTask(getDb(), id),
    onSettled: () => {
      dismissUndo();
      return refetchTasks(client);
    },
  });
}
