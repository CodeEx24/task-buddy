import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getDb } from '@/db/client';

import * as taskRepo from '../repo/task-repo';
import { RepoError } from '../repo/repo-utils';
import type { TaskBoard } from '../task-sections';
import { cleanupTaskTests, createTestQueryClient, resetTaskData } from '../testing/task-test-utils';
import { taskQueryKeys } from './task-query-keys';
import { readTaskBoard, useTaskBoard } from './use-task-board';
import { useUndoStore } from '@/stores/undo-store';

import { useCreateTask, useDeleteTask, useRestoreTask, useUpdateTask } from './use-task-mutations';

beforeEach(async () => {
  jest.restoreAllMocks();
  await resetTaskData();
});
afterEach(cleanupTaskTests);

/** A client whose board query is already loaded, as on the list screen. */
function setup() {
  const client = createTestQueryClient();
  client.setQueryData(taskQueryKeys.board(), readTaskBoard());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const board = () => client.getQueryData<TaskBoard>(taskQueryKeys.board());
  return { client, wrapper, board };
}

const FIELDS = { title: 'Pay rent', dueAt: 1_800_000_000_000, priority: 3 };

describe('task mutations (optimistic)', () => {
  it('create shows the task in the board before the SQLite write, then the stored row', async () => {
    const { wrapper, board } = setup();
    const realCreate = taskRepo.createTask;
    const seenBeforeWrite: string[] = [];
    jest.spyOn(taskRepo, 'createTask').mockImplementation((db, input) => {
      seenBeforeWrite.push(...(board()?.open.map((t) => t.title) ?? []));
      return realCreate(db, input);
    });
    // The list screen observes the board, so the refetch after the write replaces the placeholder.
    const { result } = await renderHook(
      () => ({ board: useTaskBoard(), create: useCreateTask() }),
      {
        wrapper,
      },
    );

    await act(async () => {
      await result.current.create.mutateAsync(FIELDS);
    });

    expect(seenBeforeWrite).toEqual(['Pay rent']);
    const stored = taskRepo.listOpenTasks(getDb()).items;
    await waitFor(() => expect(board()?.open).toEqual(stored));
    expect(stored[0]).toMatchObject(FIELDS);
  });

  it('create rolls back the optimistic row when the write fails', async () => {
    const { wrapper, board } = setup();
    jest.spyOn(taskRepo, 'createTask').mockImplementation(() => {
      throw new RepoError('DB_FAILURE', 'Local database operation failed');
    });
    const { result } = await renderHook(() => useCreateTask(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(FIELDS)).rejects.toThrow(RepoError);
    });

    expect(board()?.open).toEqual([]);
  });

  it('completing moves the task to completed before the write', async () => {
    const task = taskRepo.createTask(getDb(), { title: 'a' });
    const { wrapper, board } = setup();
    const realUpdate = taskRepo.updateTask;
    let completedBeforeWrite: string[] = [];
    jest.spyOn(taskRepo, 'updateTask').mockImplementation((db, id, patch) => {
      completedBeforeWrite = board()?.completed.map((t) => t.id) ?? [];
      return realUpdate(db, id, patch);
    });
    const { result } = await renderHook(
      () => ({ board: useTaskBoard(), update: useUpdateTask() }),
      {
        wrapper,
      },
    );

    await act(async () => {
      await result.current.update.mutateAsync({ id: task.id, patch: { status: 'done' } });
    });

    expect(completedBeforeWrite).toEqual([task.id]);
    await waitFor(() => expect(board()?.completed[0]?.completedAt).toEqual(expect.any(Number)));
  });

  it('delete removes the task at once and restores the board if the write fails', async () => {
    const task = taskRepo.createTask(getDb(), { title: 'a' });
    const { wrapper, board } = setup();
    jest.spyOn(taskRepo, 'softDeleteTask').mockImplementation(() => {
      expect(board()?.open).toEqual([]);
      throw new RepoError('DB_FAILURE', 'Local database operation failed');
    });
    const { result } = await renderHook(() => useDeleteTask(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(task.id)).rejects.toThrow(RepoError);
    });

    await waitFor(() => expect(board()?.open.map((t) => t.id)).toEqual([task.id]));
  });
});

describe('useRestoreTask (undo)', () => {
  it('hides the snackbar for the restored task', async () => {
    const task = taskRepo.createTask(getDb(), { title: 'a' });
    taskRepo.softDeleteTask(getDb(), task.id);
    useUndoStore.getState().offerUndo(task.id);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useRestoreTask(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(task.id);
    });

    expect(useUndoStore.getState().offer).toBeNull();
    expect(taskRepo.getTaskById(getDb(), task.id)?.deletedAt).toBeNull();
  });

  it('keeps a newer offer made while the restore was running', async () => {
    const a = taskRepo.createTask(getDb(), { title: 'a' });
    const b = taskRepo.createTask(getDb(), { title: 'b' });
    taskRepo.softDeleteTask(getDb(), a.id);
    useUndoStore.getState().offerUndo(a.id);
    const realRestore = taskRepo.restoreTask;
    jest.spyOn(taskRepo, 'restoreTask').mockImplementation((db, id) => {
      // B is deleted (and offered) before A's restore settles.
      taskRepo.softDeleteTask(db, b.id);
      useUndoStore.getState().offerUndo(b.id);
      return realRestore(db, id);
    });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useRestoreTask(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(a.id);
    });

    expect(useUndoStore.getState().offer?.taskId).toBe(b.id);
  });
});
