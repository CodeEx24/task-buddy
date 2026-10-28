import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { subtasks } from '@/db/schema';

import {
  createSubtask,
  createTask,
  listSubtasks,
  updateSubtask,
  updateTask,
} from '../repo/task-repo';
import * as taskRepo from '../repo/task-repo';
import { RepoError } from '../repo/repo-utils';
import { MAX_SUBTASKS_PER_TASK } from '../schema';
import { SUBTASK_TITLE_REQUIRED_MESSAGE } from '../task-form';
import {
  cleanupTaskTests,
  renderWithQuery,
  resetTaskData,
  storedTask,
} from '../testing/task-test-utils';
import { COMPLETE_OFFER_MESSAGE, SUBTASK_LIMIT_MESSAGE } from './SubtaskChecklist';
import { TaskDetailModal } from './TaskDetailModal';
import { SAVE_FAILED_MESSAGE } from './TaskForm';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
}));

const mockParams = jest.mocked(useLocalSearchParams);

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(router).canGoBack.mockReturnValue(true);
  await resetTaskData();
});
afterEach(cleanupTaskTests);

async function openTask(title = 'Pay rent') {
  const task = createTask(getDb(), { title });
  mockParams.mockReturnValue({ id: task.id });
  await renderWithQuery(<TaskDetailModal />);
  await screen.findByTestId('subtasks');
  return task;
}

const storedTitles = (taskId: string) => listSubtasks(getDb(), taskId).map((s) => s.title);
/** Visible step titles, top to bottom. */
const shownTitles = () =>
  screen
    .queryAllByRole('checkbox')
    .map((box) => box.props.accessibilityLabel as string)
    .filter(Boolean);

async function addStep(title: string) {
  await fireEvent.changeText(screen.getByLabelText('New step'), title);
  await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));
}

describe('SubtaskChecklist (TB-28 AC1)', () => {
  it('adds steps to the end of the checklist and saves them', async () => {
    const task = await openTask();
    expect(screen.getByTestId('subtasks-empty')).toBeOnTheScreen();

    await addStep('Find the bill');
    await fireEvent.changeText(screen.getByLabelText('New step'), '  Pay online ');
    await fireEvent(screen.getByLabelText('New step'), 'submitEditing');

    expect(await screen.findByRole('checkbox', { name: 'Pay online' })).toBeOnTheScreen();
    expect(shownTitles()).toEqual(['Find the bill', 'Pay online']);
    expect(screen.getByLabelText('New step')).toHaveDisplayValue('');
    expect(screen.getByTestId('subtasks-progress')).toHaveTextContent('0 of 2 done');
    await waitFor(() => expect(storedTitles(task.id)).toEqual(['Find the bill', 'Pay online']));
  });

  it('rejects a blank step', async () => {
    const task = await openTask();
    await addStep('   ');
    expect(await screen.findByText(SUBTASK_TITLE_REQUIRED_MESSAGE)).toBeOnTheScreen();
    expect(storedTitles(task.id)).toEqual([]);
  });

  it('checks and unchecks a step', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    const step = createSubtask(getDb(), { taskId: task.id, title: 'Find the bill' });
    createSubtask(getDb(), { taskId: task.id, title: 'Pay online' });
    mockParams.mockReturnValue({ id: task.id });
    await renderWithQuery(<TaskDetailModal />);

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Find the bill' }));
    expect(screen.getByRole('checkbox', { name: 'Find the bill' })).toBeChecked();
    expect(screen.getByTestId('subtasks-progress')).toHaveTextContent('1 of 2 done');
    await waitFor(() => expect(listSubtasks(getDb(), task.id)[0]?.isDone).toBe(true));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Find the bill' }));
    await waitFor(() => expect(listSubtasks(getDb(), task.id)[0]?.isDone).toBe(false));
    expect(listSubtasks(getDb(), task.id)[0]?.id).toBe(step.id);
  });

  it('reorders steps with move up / move down', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    for (const title of ['one', 'two', 'three']) createSubtask(getDb(), { taskId: task.id, title });
    mockParams.mockReturnValue({ id: task.id });
    await renderWithQuery(<TaskDetailModal />);
    await screen.findByRole('checkbox', { name: 'three' });

    expect(screen.getByRole('button', { name: 'Move one up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move three down' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Move three up' }));
    expect(shownTitles()).toEqual(['one', 'three', 'two']);
    await fireEvent.press(screen.getByRole('button', { name: 'Move one down' }));
    expect(shownTitles()).toEqual(['three', 'one', 'two']);
    await waitFor(() => expect(storedTitles(task.id)).toEqual(['three', 'one', 'two']));
  });

  it('deletes a step (soft delete)', async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    const step = createSubtask(getDb(), { taskId: task.id, title: 'Find the bill' });
    mockParams.mockReturnValue({ id: task.id });
    await renderWithQuery(<TaskDetailModal />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete Find the bill' }));

    await waitFor(() => expect(storedTitles(task.id)).toEqual([]));
    expect(screen.queryByRole('checkbox', { name: 'Find the bill' })).toBeNull();
    // The row is kept with deleted_at set (soft delete, synced later).
    const row = getDb().select().from(subtasks).where(eq(subtasks.id, step.id)).get();
    expect(row?.deletedAt).toEqual(expect.any(Number));
  });

  it('rolls a failed write back and says so', async () => {
    const task = await openTask();
    const spy = jest.spyOn(taskRepo, 'createSubtask').mockImplementation(() => {
      throw new RepoError('DB_FAILURE', 'Local database operation failed');
    });

    await addStep('Find the bill');

    expect(await screen.findByText(SAVE_FAILED_MESSAGE)).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Find the bill' })).toBeNull(),
    );
    expect(storedTitles(task.id)).toEqual([]);
    spy.mockRestore();
  });

  it(`hides the add field at ${MAX_SUBTASKS_PER_TASK} steps`, async () => {
    const task = createTask(getDb(), { title: 'Pay rent' });
    for (let i = 0; i < MAX_SUBTASKS_PER_TASK; i += 1) {
      createSubtask(getDb(), { taskId: task.id, title: `s${i}` });
    }
    mockParams.mockReturnValue({ id: task.id });
    await renderWithQuery(<TaskDetailModal />);

    expect(await screen.findByText(SUBTASK_LIMIT_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByLabelText('New step')).toBeNull();
  });
});

describe('completing the parent when every step is checked (TB-28 AC2)', () => {
  async function openWithSteps(doneFlags: boolean[], status: 'open' | 'done' = 'open') {
    const task = createTask(getDb(), { title: 'Pay rent' });
    doneFlags.forEach((isDone, i) => {
      const step = createSubtask(getDb(), { taskId: task.id, title: `step ${i + 1}` });
      if (isDone) updateSubtask(getDb(), step.id, { isDone });
    });
    if (status === 'done') updateTask(getDb(), task.id, { status: 'done' });
    mockParams.mockReturnValue({ id: task.id });
    await renderWithQuery(<TaskDetailModal />);
    await screen.findByTestId('subtasks-progress');
    return task;
  }

  it('offers to complete the task once the last step is checked, and completes it on accept', async () => {
    const task = await openWithSteps([true, false]);
    expect(screen.queryByTestId('subtasks-complete-offer')).toBeNull();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'step 2' }));

    const offer = await screen.findByTestId('subtasks-complete-offer');
    expect(within(offer).getByText(COMPLETE_OFFER_MESSAGE)).toBeOnTheScreen();
    // Only offered: the task is still open until the user accepts.
    expect(storedTask(task.id)?.status).toBe('open');

    await fireEvent.press(within(offer).getByRole('button', { name: 'Complete task' }));

    await waitFor(() => expect(storedTask(task.id)?.status).toBe('done'));
    expect(await screen.findByRole('button', { name: 'Mark as not done' })).toBeOnTheScreen();
    expect(screen.queryByTestId('subtasks-complete-offer')).toBeNull();
  });

  it('"Not now" hides the offer until a step is unchecked and checked again', async () => {
    const task = await openWithSteps([true, false]);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'step 2' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));

    expect(screen.queryByTestId('subtasks-complete-offer')).toBeNull();
    expect(storedTask(task.id)?.status).toBe('open');

    await fireEvent.press(screen.getByRole('checkbox', { name: 'step 1' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'step 1' }));
    expect(await screen.findByTestId('subtasks-complete-offer')).toBeOnTheScreen();
  });

  it('offers it when a task opens with every step already checked', async () => {
    await openWithSteps([true, true]);
    expect(screen.getByTestId('subtasks-complete-offer')).toBeOnTheScreen();
  });

  it('does not offer it for a completed task or a task without steps', async () => {
    await openWithSteps([true, true], 'done');
    expect(screen.queryByTestId('subtasks-complete-offer')).toBeNull();
    await screen.unmount();
    await openTask('No steps');
    expect(screen.queryByTestId('subtasks-complete-offer')).toBeNull();
  });
});
