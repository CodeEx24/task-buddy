import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { getDb } from '@/db/client';
import { migrateDb, resetDbForTests } from '@/db/node-client';

import { createTask, listOpenTasks } from './repo/task-repo';
import { cleanupTaskTests, storedTask } from './testing/task-test-utils';

// The tab bar's icons load fonts through expo-asset, which Jest can't resolve (TB-18).
jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes: root layout (DbGate + QueryProvider), tabs, task modals.
const APP_DIR = './src/app';
// DbGate migrates before any screen renders, and cold Jest caches (CI) make the first render slow.
const ROUTE_TEST_TIMEOUT_MS = 30_000;

beforeEach(() => {
  cleanupTaskTests();
  // DbGate migrates the fresh DB on mount.
  resetDbForTests();
});
afterEach(cleanupTaskTests);

describe('task CRUD through the app routes (TB-26)', () => {
  it(
    'add → edit → complete → un-complete → delete → undo',
    async () => {
      await renderRouter(APP_DIR, { initialUrl: '/inbox' });
      expect(await screen.findByTestId('task-list-empty')).toBeVisible();

      // AC1: add with a due date and priority; it shows in the right section.
      await fireEvent.press(screen.getByTestId('add-task-button'));
      expect(screen).toHavePathname('/task/new');
      await fireEvent.changeText(await screen.findByLabelText('Title'), 'Pay rent');
      await fireEvent.press(screen.getByRole('radio', { name: 'Tomorrow' }));
      await fireEvent.press(screen.getByRole('radio', { name: 'High' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

      await waitFor(() => expect(screen).toHavePathname('/inbox'));
      expect(await screen.findByTestId('task-section-upcoming')).toBeVisible();
      expect(screen.getByRole('checkbox', { name: 'Pay rent' })).toBeVisible();
      expect(screen.getByText('Tomorrow · High priority')).toBeVisible();
      const [task] = listOpenTasks(getDb()).items;
      if (!task) throw new Error('expected the saved task in SQLite');

      // Edit: move it to today.
      await fireEvent.press(screen.getByRole('button', { name: 'Edit Pay rent' }));
      expect(screen).toHavePathname(`/task/${task.id}`);
      await fireEvent.press(await screen.findByRole('radio', { name: 'Today' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(screen).toHavePathname('/inbox'));
      expect(await screen.findByTestId('task-section-today')).toBeVisible();
      expect(screen.queryByTestId('task-section-upcoming')).toBeNull();

      // AC2: complete → Completed with a timestamp → un-complete.
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Pay rent' }));
      expect(await screen.findByTestId('task-section-completed')).toBeVisible();
      expect(screen.getByText(/^Completed [A-Z][a-z]{2} \d{1,2}, /)).toBeVisible();
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Pay rent' }));
      expect(await screen.findByTestId('task-section-today')).toBeVisible();
      expect(screen.queryByTestId('task-section-completed')).toBeNull();

      // AC3: delete from the modal → soft delete + undo snackbar on the list → Undo.
      await fireEvent.press(screen.getByRole('button', { name: 'Edit Pay rent' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Delete task' }));
      await waitFor(() => expect(screen).toHavePathname('/inbox'));
      expect(await screen.findByTestId('undo-snackbar')).toBeVisible();
      await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Pay rent' })).toBeNull());
      expect(storedTask(task.id)?.deletedAt).toEqual(expect.any(Number));

      await fireEvent.press(screen.getByTestId('undo-button'));
      expect(await screen.findByRole('checkbox', { name: 'Pay rent' })).toBeVisible();
      expect(screen.queryByTestId('undo-snackbar')).toBeNull();
      expect(storedTask(task.id)?.deletedAt).toBeNull();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    'undo shows after deleting from a task modal deep-linked over Today',
    async () => {
      await migrateDb(getDb());
      const task = createTask(getDb(), { title: 'Call mom' });
      await renderRouter(APP_DIR, { initialUrl: `/task/${task.id}` });

      await fireEvent.press(await screen.findByRole('button', { name: 'Delete task' }));

      await waitFor(() => expect(screen).toHavePathname('/'));
      expect(await screen.findByTestId('home-screen')).toBeVisible();
      expect(screen.getByTestId('undo-snackbar')).toBeVisible();
      expect(storedTask(task.id)?.deletedAt).toEqual(expect.any(Number));

      await fireEvent.press(screen.getByTestId('undo-button'));
      await waitFor(() => expect(storedTask(task.id)?.deletedAt).toBeNull());
      expect(screen.queryByTestId('undo-snackbar')).toBeNull();
    },
    ROUTE_TEST_TIMEOUT_MS,
  );
});
