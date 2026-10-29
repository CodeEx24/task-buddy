import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getDb } from '@/db/client';
import {
  useCreateTask,
  useDeleteTask,
  useRestoreTask,
  useUpdateTask,
} from '@/features/tasks/hooks/use-task-mutations';
import { createTask } from '@/features/tasks/repo/task-repo';
import {
  cleanupTaskTests,
  createTestQueryClient,
  resetTaskData,
} from '@/features/tasks/testing/task-test-utils';
import { addLocalDays } from '@/lib/dates';

import {
  createFakeReminderScheduler,
  type FakeReminderScheduler,
} from '../testing/fake-reminder-scheduler';
import { RemindersProvider } from './RemindersProvider';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/** 09:30 the day after tomorrow: a due time, safely in the future. */
const dueSoon = (minutes = 0) => addLocalDays(Date.now(), 2) + (9 * 60 + 30 + minutes) * 60_000;

let scheduler: FakeReminderScheduler;
let appStateListener: ((state: AppStateStatus) => void) | undefined;

beforeEach(async () => {
  await resetTaskData();
  scheduler = createFakeReminderScheduler();
  jest.mocked(router.push).mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  cleanupTaskTests();
});

function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RemindersProvider scheduler={scheduler} />
      {children}
    </QueryClientProvider>
  );
  return { client, wrapper };
}

describe('RemindersProvider (TB-40)', () => {
  it('reconciles on start without prompting for permission', async () => {
    const task = createTask(getDb(), { title: 'Before launch', dueAt: dueSoon() });
    scheduler.permission = 'granted';
    const { wrapper } = setup();
    await render(<></>, { wrapper });
    await waitFor(() => expect(scheduler.list().map((r) => r.taskId)).toEqual([task.id]));
  });

  it('does not prompt on start; prompts after the user saves a task with a time', async () => {
    scheduler.permission = 'undetermined';
    createTask(getDb(), { title: 'Already there', dueAt: dueSoon() });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useCreateTask(), { wrapper });
    await act(async () => {});
    expect(scheduler.calls.prompts).toBe(0);

    await act(async () => {
      await result.current.mutateAsync({
        title: 'New',
        dueAt: dueSoon(5),
        priority: 0,
        notes: null,
      });
    });
    await waitFor(() => expect(scheduler.list()).toHaveLength(2));
    expect(scheduler.calls.prompts).toBe(1);
  });

  it('follows create, edit, complete, delete and undo through the real task mutations', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        create: useCreateTask(),
        update: useUpdateTask(),
        remove: useDeleteTask(),
        restore: useRestoreTask(),
      }),
      { wrapper },
    );

    let id = '';
    await act(async () => {
      const task = await result.current.create.mutateAsync({
        title: 'Water plants',
        dueAt: dueSoon(),
        priority: 0,
        notes: null,
      });
      id = task.id;
    });
    await waitFor(() =>
      expect(scheduler.list()).toEqual([{ taskId: id, fireAt: dueSoon(), title: 'Water plants' }]),
    );

    // AC3: new due time → rescheduled.
    await act(async () => {
      await result.current.update.mutateAsync({ id, patch: { dueAt: dueSoon(45) } });
    });
    await waitFor(() => expect(scheduler.list()[0]?.fireAt).toBe(dueSoon(45)));

    // AC2: complete → cancelled; un-complete → back.
    await act(async () => {
      await result.current.update.mutateAsync({ id, patch: { status: 'done' } });
    });
    await waitFor(() => expect(scheduler.list()).toEqual([]));
    await act(async () => {
      await result.current.update.mutateAsync({ id, patch: { status: 'open' } });
    });
    await waitFor(() => expect(scheduler.list()).toHaveLength(1));

    // AC2: delete → cancelled; undo → back.
    await act(async () => {
      await result.current.remove.mutateAsync(id);
    });
    await waitFor(() => expect(scheduler.list()).toEqual([]));
    await act(async () => {
      await result.current.restore.mutateAsync(id);
    });
    await waitFor(() => expect(scheduler.list().map((r) => r.taskId)).toEqual([id]));
  });

  it('re-scans when the app comes back to the foreground', async () => {
    const { wrapper } = setup();
    await render(<></>, { wrapper });
    await act(async () => {});
    expect(scheduler.list()).toEqual([]);

    // Written while the app was in the background (e.g. by a sync).
    const task = createTask(getDb(), { title: 'x', dueAt: dueSoon() });
    await act(async () => appStateListener?.('active'));
    await waitFor(() => expect(scheduler.list().map((r) => r.taskId)).toEqual([task.id]));
  });

  it('sign-out (unmount) cancels every pending reminder', async () => {
    createTask(getDb(), { title: 'x', dueAt: dueSoon() });
    const { wrapper } = setup();
    const { unmount } = await render(<></>, { wrapper });
    await waitFor(() => expect(scheduler.list()).toHaveLength(1));

    await act(async () => unmount());
    await waitFor(() => expect(scheduler.list()).toEqual([]));
    expect(scheduler.calls.cancelAll).toBe(1);
  });

  it('tapping a reminder opens its task (taskbuddy://task/<id>)', async () => {
    const task = createTask(getDb(), { title: 'x', dueAt: dueSoon() });
    const { wrapper } = setup();
    await render(<></>, { wrapper });
    await act(async () => scheduler.open(task.id));
    expect(router.push).toHaveBeenCalledWith(`/task/${task.id}`);
  });
});
