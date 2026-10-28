import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { getDb } from '@/db/client';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';
import { useUndoStore } from '@/stores/undo-store';

import { AUTOSAVE_DELAY_MS } from '@/lib/use-autosave';

import { taskQueryKeys } from '../hooks/task-query-keys';
import { RepoError } from '../repo/repo-utils';
import * as taskRepo from '../repo/task-repo';
import { createTask, updateTask } from '../repo/task-repo';
import { MAX_NOTES_LENGTH } from '../schema';
import { NOTES_TOO_LONG_MESSAGE } from '../task-form';
import {
  cleanupTaskTests,
  createTestQueryClient,
  renderWithQuery,
  resetTaskData,
  storedTask,
} from '../testing/task-test-utils';
import {
  INVALID_TASK_LINK_MESSAGE,
  TASK_NOT_FOUND_MESSAGE,
  TaskDetailModal,
} from './TaskDetailModal';
import {
  AUTOSAVE_FAILED_MESSAGE,
  NOT_SAVED_INVALID_MESSAGE,
  SAVED_MESSAGE,
  SAVING_MESSAGE,
} from './TaskDetailForm';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
}));

const mockParams = jest.mocked(useLocalSearchParams);
const mockRouter = jest.mocked(router);

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  await resetTaskData();
});
afterEach(cleanupTaskTests);

const NOTES = 'Landlord: Ana\nIBAN on the fridge';

async function openModalFor(id: string) {
  mockParams.mockReturnValue({ id });
  return renderWithQuery(<TaskDetailModal />);
}

describe('TaskDetailModal', () => {
  it('shows the invalid-link message and no task for a malformed id', async () => {
    await openModalFor('<script>');

    expect(screen.getByTestId('task-detail-invalid')).toBeOnTheScreen();
    expect(screen.getByText(INVALID_TASK_LINK_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText(/<script>/)).toBeNull();
    expect(screen.queryByTestId('task-detail-modal')).toBeNull();
  });

  it('shows not-found for an unknown or deleted task', async () => {
    await openModalFor('0190f3b2-7c1a-7d4e-9b2f-3a6c8e1d5f42');

    expect(await screen.findByText(TASK_NOT_FOUND_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByTestId('task-detail-modal')).toBeOnTheScreen();
  });

  it('pre-fills the form and autosaves edits without a Save button (TB-28 AC1, AC3)', async () => {
    const dueAt = startOfLocalDay(Date.now());
    const task = createTask(getDb(), { title: 'Pay rent', dueAt, priority: 1, notes: 'Ana' });
    await openModalFor(task.id);

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveDisplayValue('Pay rent');
    expect(screen.getByLabelText('Notes')).toHaveDisplayValue('Ana');
    expect(screen.getByRole('radio', { name: 'Today' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Low' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();

    await fireEvent.changeText(title, 'Pay rent and water');
    await fireEvent.changeText(screen.getByLabelText('Notes'), NOTES);
    await fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'High' }));

    await waitFor(() =>
      expect(storedTask(task.id)).toMatchObject({
        title: 'Pay rent and water',
        notes: NOTES,
        dueAt: addLocalDays(dueAt, 1),
        priority: 3,
      }),
    );
    expect(await screen.findByText(SAVED_MESSAGE)).toBeOnTheScreen();
    // Autosave never closes the screen.
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('autosaves 500 ms after the last keystroke, not before (TB-28 AC3)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await openModalFor(task.id);
    const notes = await screen.findByLabelText('Notes');

    jest.useFakeTimers();
    try {
      await fireEvent.changeText(notes, 'L');
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      await fireEvent.changeText(notes, 'Landlord');
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
      });
      // 799 ms after the first keystroke, 499 ms after the last: nothing written yet.
      expect(storedTask(task.id)?.notes).toBeNull();
      expect(screen.getByTestId('task-detail-save-status')).toHaveTextContent(SAVING_MESSAGE);

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      expect(storedTask(task.id)?.notes).toBe('Landlord');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows field errors for invalid input and saves nothing until it is valid', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await openModalFor(task.id);

    await fireEvent.changeText(await screen.findByLabelText('Title'), '   ');
    await fireEvent.changeText(screen.getByLabelText('Or type a date'), '2026-02-30');
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'n'.repeat(MAX_NOTES_LENGTH + 1));

    expect(await screen.findByText('Add a title')).toBeOnTheScreen();
    expect(screen.getByText('Use a real date as YYYY-MM-DD')).toBeOnTheScreen();
    expect(screen.getByText(NOTES_TOO_LONG_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByTestId('task-detail-save-status')).toHaveTextContent(
      NOT_SAVED_INVALID_MESSAGE,
    );
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 100));
    expect(storedTask(task.id)).toMatchObject({ title: 'Pay rent', notes: null, dueAt: null });

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Pay rent');
    await fireEvent.changeText(screen.getByLabelText('Or type a date'), '');
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'ok');
    await waitFor(() => expect(storedTask(task.id)?.notes).toBe('ok'));
  });

  it('saves a change still waiting for autosave when the modal closes', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await openModalFor(task.id);

    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'typed just before closing');
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await screen.unmount();

    await waitFor(() => expect(storedTask(task.id)?.notes).toBe('typed just before closing'));
  });

  it('shows an error and keeps the typed text when autosave fails', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    const updateSpy = jest.spyOn(taskRepo, 'updateTask').mockImplementation(() => {
      throw new RepoError('DB_FAILURE', 'Local database operation failed');
    });
    await openModalFor(task.id);

    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'will fail');

    expect(await screen.findByText(AUTOSAVE_FAILED_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByLabelText('Notes')).toHaveDisplayValue('will fail');
    // Not retried in a loop: one attempt for one change.
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS * 2));
    expect(updateSpy).toHaveBeenCalledTimes(1);

    updateSpy.mockRestore();
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'will work');
    await waitFor(() => expect(storedTask(task.id)?.notes).toBe('will work'));
  });

  it('completes with a timestamp and un-completes (AC2)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await openModalFor(task.id);

    await fireEvent.press(await screen.findByRole('button', { name: 'Mark complete' }));

    expect(await screen.findByTestId('task-detail-completed-at')).toHaveTextContent(/^Completed /);
    expect(storedTask(task.id)).toMatchObject({ status: 'done', completedAt: expect.any(Number) });

    await fireEvent.press(screen.getByRole('button', { name: 'Mark as not done' }));

    expect(await screen.findByRole('button', { name: 'Mark complete' })).toBeOnTheScreen();
    expect(storedTask(task.id)).toMatchObject({ status: 'open', completedAt: null });
  });

  it('soft-deletes, closes and offers undo (AC3)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await openModalFor(task.id);

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete task' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(storedTask(task.id)?.deletedAt).toEqual(expect.any(Number));
    expect(useUndoStore.getState().offer?.taskId).toBe(task.id);
  });

  it('never shows "not found" while a delete closes the modal', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    const client = createTestQueryClient();
    // Records every value the modal's task query takes; the not-found card renders on `null`.
    const detailValues: unknown[] = [];
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (key[1] === 'detail' && key[2] === task.id && event.type === 'updated') {
        detailValues.push(event.query.state.data);
      }
    });
    mockParams.mockReturnValue({ id: task.id });
    await renderWithQuery(<TaskDetailModal />, client);

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete task' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    unsubscribe();

    expect(detailValues).not.toContain(null);
    expect(screen.queryByTestId('task-detail-not-found')).toBeNull();
    // Marked stale, so reopening the deleted task's link refetches it (and then shows not found).
    expect(client.getQueryState(taskQueryKeys.detail(task.id))?.isInvalidated).toBe(true);
  });

  it('shows the completion time of an already completed task', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    updateTask(getDb(), task.id, { status: 'done' });
    await openModalFor(task.id);

    expect(await screen.findByTestId('task-detail-completed-at')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark as not done' })).toBeOnTheScreen();
  });

  it('Close goes back, or falls back to Today with nothing underneath', async () => {
    await openModalFor('sample-task');
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);

    mockRouter.canGoBack.mockReturnValue(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
