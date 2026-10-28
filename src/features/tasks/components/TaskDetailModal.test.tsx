import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { getDb } from '@/db/client';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';
import { useUndoStore } from '@/stores/undo-store';

import { createTask, updateTask } from '../repo/task-repo';
import {
  cleanupTaskTests,
  renderWithQuery,
  resetTaskData,
  storedTask,
} from '../testing/task-test-utils';
import {
  INVALID_TASK_LINK_MESSAGE,
  TASK_NOT_FOUND_MESSAGE,
  TaskDetailModal,
} from './TaskDetailModal';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
}));

const mockParams = jest.mocked(useLocalSearchParams);
const mockRouter = jest.mocked(router);

beforeEach(async () => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  await resetTaskData();
});
afterEach(cleanupTaskTests);

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

  it('pre-fills the form and saves edits to the DB', async () => {
    const dueAt = startOfLocalDay(Date.now());
    const task = createTask(getDb(), { title: 'Pay rent', dueAt, priority: 1 });
    await openModalFor(task.id);

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveDisplayValue('Pay rent');
    expect(screen.getByRole('radio', { name: 'Today' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Low' })).toBeChecked();

    await fireEvent.changeText(title, 'Pay rent and water');
    await fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'High' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(storedTask(task.id)).toMatchObject({
      title: 'Pay rent and water',
      dueAt: addLocalDays(dueAt, 1),
      priority: 3,
    });
  });

  it('keeps the modal open with field errors for invalid input', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await openModalFor(task.id);

    await fireEvent.changeText(await screen.findByLabelText('Title'), '   ');
    await fireEvent.changeText(screen.getByLabelText('Or type a date'), '2026-02-30');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Add a title')).toBeOnTheScreen();
    expect(screen.getByText('Use a real date as YYYY-MM-DD')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(storedTask(task.id)?.title).toBe('Pay rent');
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
