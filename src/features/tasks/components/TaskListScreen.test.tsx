import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';

import { getDb } from '@/db/client';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';
import { swipeableClose } from '@/components/ui/testing/swipeable-mock';
import { UNDO_WINDOW_MS, useUndoStore } from '@/stores/undo-store';

import { createTask, softDeleteTask, updateTask } from '../repo/task-repo';
import {
  cleanupTaskTests,
  renderWithQuery,
  resetTaskData,
  storedTask,
} from '../testing/task-test-utils';
import { NEW_TASK_HREF, NEW_TODAY_TASK_HREF } from '../task-routes';
import { TaskListScreen } from './TaskListScreen';
import { UndoSnackbar } from './UndoSnackbar';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() },
}));

const mockRouter = jest.mocked(router);
const today = () => startOfLocalDay(Date.now());
const tomorrow = () => addLocalDays(Date.now(), 1);

/** Both tabs on one query client, as in the app (both stay mounted), plus the root snackbar. */
function BothTabs() {
  return (
    <>
      <TaskListScreen kind="today" />
      <TaskListScreen kind="inbox" />
      <UndoSnackbar />
    </>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await resetTaskData();
});
afterEach(cleanupTaskTests);

const checkboxNames = (screenTestId: string) =>
  within(screen.getByTestId(screenTestId))
    .queryAllByRole('checkbox')
    .map((c) => c.props.accessibilityLabel as string);

/** The panel a swipe uncovers (hidden from screen readers: the actions are on the checkbox). */
const swipePanel = (action: 'toggle-done' | 'tomorrow', taskId: string) =>
  screen.queryByTestId(`task-swipe-${action}-${taskId}`, { includeHiddenElements: true });

const swipe = (taskId: string, direction: 'left' | 'right') =>
  fireEvent.press(screen.getByTestId(`task-swipe-${taskId}-swipe-${direction}`));

describe('Today and Inbox screens (TB-27)', () => {
  it('Today: the empty state explains the next action; Add task presets today (AC3)', async () => {
    await renderWithQuery(<TaskListScreen kind="today" />);

    const empty = await screen.findByTestId('today-empty');
    expect(empty).toHaveTextContent(/Nothing planned/);
    expect(empty).toHaveTextContent(/Tap Add task to plan one for today/);
    await fireEvent.press(screen.getByTestId('today-add-task-button'));
    expect(mockRouter.push).toHaveBeenCalledWith(NEW_TODAY_TASK_HREF);
  });

  it('Inbox: the empty state explains the next action; Add task has no preset (AC3)', async () => {
    await renderWithQuery(<TaskListScreen kind="inbox" />);

    const empty = await screen.findByTestId('inbox-empty');
    expect(empty).toHaveTextContent(/Inbox is clear/);
    expect(empty).toHaveTextContent(/Tap Add task to note one down/);
    await fireEvent.press(screen.getByTestId('add-task-button'));
    expect(mockRouter.push).toHaveBeenCalledWith(NEW_TASK_HREF);
  });

  it('Today shows Overdue, Today and Later; Inbox shows undated tasks (AC1)', async () => {
    const db = getDb();
    createTask(db, { title: 'Undated' });
    createTask(db, { title: 'Overdue', dueAt: addLocalDays(today(), -2) });
    createTask(db, { title: 'Next week', dueAt: addLocalDays(today(), 7), priority: 3 });
    createTask(db, { title: 'Due today', dueAt: today(), priority: 2 });
    const doneDated = createTask(db, { title: 'Done dated', dueAt: today() });
    updateTask(db, doneDated.id, { status: 'done' });
    const doneUndated = createTask(db, { title: 'Done undated' });
    updateTask(db, doneUndated.id, { status: 'done' });
    await renderWithQuery(<BothTabs />);

    expect(await screen.findByTestId('today-section-overdue')).toHaveTextContent('Overdue');
    expect(screen.getByTestId('today-section-today')).toHaveTextContent('Today');
    expect(screen.getByTestId('today-section-later')).toHaveTextContent('Later');
    expect(screen.getByTestId('today-section-completed')).toHaveTextContent('Completed');
    expect(checkboxNames('today-screen')).toEqual([
      'Overdue',
      'Due today',
      'Next week',
      'Done dated',
    ]);
    expect(screen.getByText(/^Overdue · /)).toBeOnTheScreen();
    expect(screen.getByText('Today · Medium priority')).toBeOnTheScreen();

    expect(screen.getByTestId('inbox-section-no-date')).toHaveTextContent('No date');
    expect(screen.getByTestId('inbox-section-completed')).toBeOnTheScreen();
    expect(checkboxNames('inbox-screen')).toEqual(['Undated', 'Done undated']);
    expect(screen.getByRole('checkbox', { name: 'Done undated' })).toBeChecked();
    expect(screen.getByTestId(`task-meta-${doneUndated.id}`)).toHaveTextContent(/^Completed /);
  });

  it('swipe right completes a task and swipe right again reopens it (AC2)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent', dueAt: today() });
    await renderWithQuery(<TaskListScreen kind="today" />);
    expect(await screen.findByTestId('today-section-today')).toBeOnTheScreen();
    expect(swipePanel('toggle-done', task.id)).toHaveTextContent('Complete');

    await swipe(task.id, 'right');

    expect(await screen.findByTestId('today-section-completed')).toBeOnTheScreen();
    expect(screen.queryByTestId('today-section-today')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Pay rent' })).toBeChecked();
    expect(swipeableClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(storedTask(task.id)).toMatchObject({
        status: 'done',
        completedAt: expect.any(Number),
      }),
    );

    // A done row offers only "Mark as not done": no reschedule panel.
    expect(swipePanel('toggle-done', task.id)).toHaveTextContent('Mark as not done');
    expect(swipePanel('tomorrow', task.id)).toBeNull();
    expect(screen.queryByTestId(`task-swipe-${task.id}-swipe-left`)).toBeNull();

    await swipe(task.id, 'right');

    expect(await screen.findByTestId('today-section-today')).toBeOnTheScreen();
    await waitFor(() =>
      expect(storedTask(task.id)).toMatchObject({ status: 'open', completedAt: null }),
    );
  });

  it('swipe left moves a task to tomorrow: Today → Later (AC2)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent', dueAt: addLocalDays(today(), -3) });
    await renderWithQuery(<TaskListScreen kind="today" />);
    expect(await screen.findByTestId('today-section-overdue')).toBeOnTheScreen();
    expect(swipePanel('tomorrow', task.id)).toHaveTextContent('Move to tomorrow');

    await swipe(task.id, 'left');

    expect(await screen.findByTestId('today-section-later')).toBeOnTheScreen();
    expect(screen.queryByTestId('today-section-overdue')).toBeNull();
    expect(screen.getByTestId(`task-meta-${task.id}`)).toHaveTextContent('Tomorrow');
    expect(swipeableClose).toHaveBeenCalled();
    await waitFor(() => expect(storedTask(task.id)?.dueAt).toBe(tomorrow()));
    expect(storedTask(task.id)?.status).toBe('open');
  });

  it('swipe left on an Inbox task plans it for tomorrow: it moves to Today → Later (AC2)', async () => {
    const task = createTask(getDb(), { title: 'Call mom' });
    await renderWithQuery(<BothTabs />);
    expect(await screen.findByTestId('inbox-section-no-date')).toBeOnTheScreen();

    await swipe(task.id, 'left');

    expect(await screen.findByTestId('today-section-later')).toBeOnTheScreen();
    expect(checkboxNames('today-screen')).toEqual(['Call mom']);
    expect(screen.getByTestId('inbox-empty')).toBeOnTheScreen();
    await waitFor(() => expect(storedTask(task.id)?.dueAt).toBe(tomorrow()));
  });

  describe('accessible alternative to swiping (AC2)', () => {
    it('offers the swipe actions as accessibility actions on the row', async () => {
      const open = createTask(getDb(), { title: 'Open task', dueAt: today() });
      const done = createTask(getDb(), { title: 'Done task', dueAt: today() });
      updateTask(getDb(), done.id, { status: 'done' });
      await renderWithQuery(<TaskListScreen kind="today" />);

      expect(
        (await screen.findByRole('checkbox', { name: 'Open task' })).props.accessibilityActions,
      ).toEqual([
        { name: 'toggle-done', label: 'Complete' },
        { name: 'tomorrow', label: 'Move to tomorrow' },
      ]);
      expect(screen.getByTestId(`task-checkbox-${open.id}`)).toBeOnTheScreen();
      expect(
        screen.getByRole('checkbox', { name: 'Done task' }).props.accessibilityActions,
      ).toEqual([{ name: 'toggle-done', label: 'Mark as not done' }]);
    });

    it('"Move to tomorrow" reschedules and announces it', async () => {
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const task = createTask(getDb(), { title: 'Pay rent', dueAt: today() });
      await renderWithQuery(<TaskListScreen kind="today" />);

      await fireEvent(
        await screen.findByRole('checkbox', { name: 'Pay rent' }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'tomorrow' } },
      );

      expect(await screen.findByTestId('today-section-later')).toBeOnTheScreen();
      expect(announce).toHaveBeenCalledWith('Pay rent moved to tomorrow');
      await waitFor(() => expect(storedTask(task.id)?.dueAt).toBe(tomorrow()));
      announce.mockRestore();
    });

    it('"Complete" completes and announces it; unknown actions do nothing', async () => {
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const task = createTask(getDb(), { title: 'Pay rent' });
      await renderWithQuery(<TaskListScreen kind="inbox" />);
      const checkbox = await screen.findByRole('checkbox', { name: 'Pay rent' });

      await fireEvent(checkbox, 'accessibilityAction', { nativeEvent: { actionName: 'magic' } });
      expect(announce).not.toHaveBeenCalled();
      expect(storedTask(task.id)?.status).toBe('open');

      await fireEvent(checkbox, 'accessibilityAction', {
        nativeEvent: { actionName: 'toggle-done' },
      });

      expect(await screen.findByTestId('inbox-section-completed')).toBeOnTheScreen();
      expect(announce).toHaveBeenCalledWith('Pay rent completed');
      await waitFor(() => expect(storedTask(task.id)?.status).toBe('done'));
      announce.mockRestore();
    });
  });

  it('completing with the checkbox moves a task to Completed with a timestamp; un-completing moves it back (TB-26 AC2)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent', dueAt: today() });
    await renderWithQuery(<TaskListScreen kind="today" />);

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Pay rent' }));

    expect(await screen.findByTestId('today-section-completed')).toBeOnTheScreen();
    expect(screen.getByTestId(`task-meta-${task.id}`)).toHaveTextContent(
      /^Completed [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/,
    );
    await waitFor(() => expect(storedTask(task.id)?.status).toBe('done'));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Pay rent' }));

    expect(await screen.findByTestId('today-section-today')).toBeOnTheScreen();
    await waitFor(() =>
      expect(storedTask(task.id)).toMatchObject({ status: 'open', completedAt: null }),
    );
  });

  it('opens a task from its Edit button', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    await renderWithQuery(<TaskListScreen kind="inbox" />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Pay rent' }));
    expect(mockRouter.push).toHaveBeenCalledWith(`/task/${task.id}`);
  });

  it('virtualizes a list of 500 tasks: only the first window of rows is rendered (AC3)', async () => {
    const db = getDb();
    for (let i = 0; i < 500; i++) {
      createTask(db, { title: `Task ${i}`, dueAt: addLocalDays(today(), (i % 30) - 10) });
    }
    await renderWithQuery(<TaskListScreen kind="today" />);

    expect(await screen.findByTestId('today-section-overdue')).toBeOnTheScreen();
    const rendered = screen.getAllByTestId(/^task-row-/).length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
  });

  it('Undo restores a deleted task (TB-26 AC3)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    softDeleteTask(getDb(), task.id);
    await act(async () => useUndoStore.getState().offerUndo(task.id));
    await renderWithQuery(<BothTabs />);

    expect(await screen.findByTestId('undo-snackbar')).toHaveTextContent(/Task deleted/);
    expect(screen.queryByRole('checkbox', { name: 'Pay rent' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
    expect(storedTask(task.id)?.deletedAt).toBeNull();
  });

  it('the undo snackbar disappears after 5 seconds and the task stays deleted (TB-26 AC3)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    softDeleteTask(getDb(), task.id);
    await renderWithQuery(<BothTabs />);
    expect(await screen.findByTestId('inbox-empty')).toBeOnTheScreen();

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

  it('shows saved tasks after a restart (new query client, same DB) (TB-26 AC1)', async () => {
    createTask(getDb(), { title: 'Pay rent', dueAt: today(), priority: 3 });
    const first = await renderWithQuery(<TaskListScreen kind="today" />);
    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeOnTheScreen();
    await first.unmount();

    await renderWithQuery(<TaskListScreen kind="today" />);
    expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeOnTheScreen();
    expect(screen.getByText('Today · High priority')).toBeOnTheScreen();
  });
});
