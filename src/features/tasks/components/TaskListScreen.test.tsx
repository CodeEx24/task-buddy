import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getDb } from '@/db/client';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';
import { UNDO_WINDOW_MS, useUndoStore } from '@/stores/undo-store';

import { createTask, softDeleteTask, updateTask } from '../repo/task-repo';
import {
  cleanupTaskTests,
  renderWithQuery,
  resetTaskData,
  storedTask,
} from '../testing/task-test-utils';
import { NEW_TASK_HREF } from '../task-routes';
import { TaskListScreen } from './TaskListScreen';
import { UndoSnackbar } from './UndoSnackbar';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() },
}));

const mockRouter = jest.mocked(router);
const today = () => startOfLocalDay(Date.now());

/** The list with the snackbar the root layout renders above every screen. */
function WithUndo() {
  return (
    <>
      <TaskListScreen />
      <UndoSnackbar />
    </>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await resetTaskData();
});
afterEach(cleanupTaskTests);

const checkboxNames = () =>
  screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel as string);

describe('TaskListScreen', () => {
  it('shows the empty state and opens the add form', async () => {
    await renderWithQuery(<TaskListScreen />);

    expect(await screen.findByTestId('task-list-empty')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add task' }));
    expect(mockRouter.push).toHaveBeenCalledWith(NEW_TASK_HREF);
  });

  it('lists tasks in Today, Upcoming, No date and Completed sections', async () => {
    const db = getDb();
    createTask(db, { title: 'Undated' });
    createTask(db, { title: 'Overdue', dueAt: addLocalDays(today(), -2) });
    createTask(db, { title: 'Next week', dueAt: addLocalDays(today(), 7), priority: 3 });
    createTask(db, { title: 'Due today', dueAt: today(), priority: 2 });
    const done = createTask(db, { title: 'Done already' });
    updateTask(db, done.id, { status: 'done' });
    await renderWithQuery(<TaskListScreen />);

    expect(await screen.findByTestId('task-section-today')).toHaveTextContent('Today');
    expect(screen.getByTestId('task-section-upcoming')).toHaveTextContent('Upcoming');
    expect(screen.getByTestId('task-section-no-date')).toHaveTextContent('No date');
    expect(screen.getByTestId('task-section-completed')).toHaveTextContent('Completed');
    expect(checkboxNames()).toEqual([
      'Overdue',
      'Due today',
      'Next week',
      'Undated',
      'Done already',
    ]);
    expect(screen.getByText(/^Overdue · /)).toBeOnTheScreen();
    expect(screen.getByText('Today · Medium priority')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Done already' })).toBeChecked();
    expect(screen.getByTestId(`task-meta-${done.id}`)).toHaveTextContent(/^Completed /);
  });

  it('completing moves a task to Completed with a timestamp; un-completing moves it back (AC2)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent', dueAt: today() });
    await renderWithQuery(<TaskListScreen />);

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Pay rent' }));

    expect(await screen.findByTestId('task-section-completed')).toBeOnTheScreen();
    expect(screen.queryByTestId('task-section-today')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Pay rent' })).toBeChecked();
    expect(screen.getByTestId(`task-meta-${task.id}`)).toHaveTextContent(
      /^Completed [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/,
    );
    await waitFor(() =>
      expect(storedTask(task.id)).toMatchObject({
        status: 'done',
        completedAt: expect.any(Number),
      }),
    );

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Pay rent' }));

    expect(await screen.findByTestId('task-section-today')).toBeOnTheScreen();
    expect(screen.queryByTestId('task-section-completed')).toBeNull();
    await waitFor(() =>
      expect(storedTask(task.id)).toMatchObject({ status: 'open', completedAt: null }),
    );
  });

  it('opens a task from its Edit button', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await renderWithQuery(<TaskListScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Pay rent' }));
    expect(mockRouter.push).toHaveBeenCalledWith(`/task/${task.id}`);
  });

  it('Undo restores a deleted task (AC3)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    softDeleteTask(getDb(), task.id);
    await act(async () => useUndoStore.getState().offerUndo(task.id));
    await renderWithQuery(<WithUndo />);

    expect(await screen.findByTestId('undo-snackbar')).toHaveTextContent(/Task deleted/);
    expect(screen.queryByRole('checkbox', { name: 'Pay rent' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
    expect(storedTask(task.id)?.deletedAt).toBeNull();
  });

  it('the undo snackbar disappears after 5 seconds and the task stays deleted (AC3)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    softDeleteTask(getDb(), task.id);
    await renderWithQuery(<WithUndo />);
    expect(await screen.findByTestId('task-list-empty')).toBeOnTheScreen();

    jest.useFakeTimers();
    try {
      await act(async () => useUndoStore.getState().offerUndo(task.id));
      expect(screen.getByTestId('undo-snackbar')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(UNDO_WINDOW_MS - 1));
      expect(screen.getByTestId('undo-snackbar')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(1));
      expect(screen.queryByTestId('undo-snackbar')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
    expect(storedTask(task.id)?.deletedAt).toEqual(expect.any(Number));
  });

  it('shows saved tasks after a restart (new query client, same DB) (AC1)', async () => {
    createTask(getDb(), { title: 'Pay rent', dueAt: today(), priority: 3 });
    const first = await renderWithQuery(<TaskListScreen />);
    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeOnTheScreen();
    await first.unmount();

    await renderWithQuery(<TaskListScreen />);
    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeOnTheScreen();
    expect(screen.getByText('Today · High priority')).toBeOnTheScreen();
  });
});
