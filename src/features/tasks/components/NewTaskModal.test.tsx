import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getDb } from '@/db/client';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';

import * as taskRepo from '../repo/task-repo';
import { RepoError } from '../repo/repo-utils';
import { cleanupTaskTests, renderWithQuery, resetTaskData } from '../testing/task-test-utils';
import { NewTaskModal } from './NewTaskModal';
import { SAVE_FAILED_MESSAGE } from './TaskForm';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() },
}));

const mockRouter = jest.mocked(router);

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  await resetTaskData();
});
afterEach(cleanupTaskTests);

const openTasks = () => taskRepo.listOpenTasks(getDb()).items;

describe('NewTaskModal', () => {
  it('saves a title with due date and priority, then closes (AC1)', async () => {
    await renderWithQuery(<NewTaskModal />);

    await fireEvent.changeText(screen.getByLabelText('Title'), '  Pay rent ');
    await fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
    expect(screen.getByLabelText('Or type a date')).toHaveDisplayValue(/^\d{4}-\d{2}-\d{2}$/);
    await fireEvent.press(screen.getByRole('radio', { name: 'High' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(openTasks()).toEqual([
      expect.objectContaining({
        title: 'Pay rent',
        priority: 3,
        dueAt: addLocalDays(startOfLocalDay(Date.now()), 1),
        status: 'open',
      }),
    ]);
  });

  it('accepts a typed date and defaults to no date and no priority', async () => {
    await renderWithQuery(<NewTaskModal />);
    expect(screen.getByRole('radio', { name: 'No date' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Dentist');
    await fireEvent.changeText(screen.getByLabelText('Or type a date'), '2031-03-09');
    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(openTasks()[0]).toMatchObject({
      title: 'Dentist',
      dueAt: new Date(2031, 2, 9).getTime(),
      priority: 0,
      notes: null,
    });
  });

  it('saves a due time with the date (TB-40)', async () => {
    await renderWithQuery(<NewTaskModal />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Dentist');
    await fireEvent.changeText(screen.getByLabelText('Or type a date'), '2031-03-09');
    await fireEvent.changeText(screen.getByLabelText('Time (optional)'), '14:30');
    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(openTasks()[0]?.dueAt).toBe(new Date(2031, 2, 9, 14, 30).getTime());
  });

  it('refuses a time without a date, and "No date" clears the time (TB-40)', async () => {
    await renderWithQuery(<NewTaskModal />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Dentist');
    await fireEvent.changeText(screen.getByLabelText('Time (optional)'), '09:00');
    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
    expect(await screen.findByText('Pick a due date for this time')).toBeOnTheScreen();
    expect(openTasks()).toEqual([]);

    await fireEvent.press(screen.getByRole('radio', { name: 'Today' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'No date' }));
    expect(screen.getByLabelText('Time (optional)')).toHaveDisplayValue('');
  });

  it('saves notes typed when adding a task (TB-28)', async () => {
    await renderWithQuery(<NewTaskModal />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Dentist');
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Bring the insurance card');
    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(openTasks()[0]?.notes).toBe('Bring the insurance card');
  });

  it('shows a field error and writes nothing for a blank title', async () => {
    await renderWithQuery(<NewTaskModal />);

    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    expect(await screen.findByText('Add a title')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(openTasks()).toEqual([]);
  });

  it('stays open with an error when the DB write fails', async () => {
    jest.spyOn(taskRepo, 'createTask').mockImplementation(() => {
      throw new RepoError('DB_FAILURE', 'Local database operation failed');
    });
    await renderWithQuery(<NewTaskModal />);

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Pay rent');
    await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

    expect(await screen.findByText(SAVE_FAILED_MESSAGE)).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('Cancel closes without saving', async () => {
    await renderWithQuery(<NewTaskModal />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Pay rent');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(openTasks()).toEqual([]);
  });
});
