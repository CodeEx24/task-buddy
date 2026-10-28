// Render cost of the task lists (TB-27 review): memoised rows must not re-render when another
// task changes or when the clock ticks without changing their label. Counts TaskRow renders.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { getDb } from '@/db/client';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';
import { NOW_REFRESH_MS } from '@/lib/use-now';

import { createTask } from '../repo/task-repo';
import {
  cleanupTaskTests,
  renderWithQuery,
  resetTaskData,
  storedTask,
} from '../testing/task-test-utils';
import { LIST_TUNING, TaskListScreen } from './TaskListScreen';
import { TaskRow, taskMetaLine, type TaskRowProps } from './TaskRow';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() },
}));
// The real TaskRow, wrapped in a jest.fn so each render is recorded with its props.
jest.mock('./TaskRow', () => {
  const actual = jest.requireActual<typeof import('./TaskRow')>('./TaskRow');
  return {
    ...actual,
    TaskRow: jest.fn((props: TaskRowProps) => actual.TaskRow(props)),
    taskMetaLine: jest.fn(actual.taskMetaLine),
  };
});

const renderSpy = jest.mocked(TaskRow);
const metaSpy = jest.mocked(taskMetaLine);
const rendersOf = (taskId: string) =>
  renderSpy.mock.calls.filter(([props]) => props.task.id === taskId).length;

beforeEach(async () => {
  renderSpy.mockClear();
  metaSpy.mockClear();
  await resetTaskData();
});
afterEach(cleanupTaskTests);

describe('task list render cost (TB-27)', () => {
  it('changing one task does not re-render the other rows (also after the SQLite refetch)', async () => {
    const today = startOfLocalDay(Date.now());
    const changed = createTask(getDb(), { title: 'Changes', dueAt: today });
    const other = createTask(getDb(), { title: 'Untouched', dueAt: addLocalDays(today, 10) });
    const { client } = await renderWithQuery(<TaskListScreen kind="today" />);
    await screen.findByRole('checkbox', { name: 'Untouched' });
    const before = rendersOf(other.id);
    expect(before).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Changes' }));
    await waitFor(() => expect(storedTask(changed.id)?.status).toBe('done'));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await waitFor(() => expect(client.isMutating()).toBe(0));

    expect(screen.getByTestId('today-section-completed')).toBeOnTheScreen();
    // Control: the changed row did re-render (checked, moved to Completed).
    expect(rendersOf(changed.id)).toBeGreaterThan(1);
    expect(rendersOf(other.id)).toBe(before);
  });

  it('a clock tick re-renders no row whose label stays the same', async () => {
    const today = startOfLocalDay(Date.now());
    // "Wed, Nov 4"-style label: unchanged by a minute, even across midnight.
    const dated = createTask(getDb(), { title: 'Later task', dueAt: addLocalDays(today, 10) });
    // Fake timers from the start, so `useNow`'s interval is one Jest controls.
    jest.useFakeTimers();
    try {
      await renderWithQuery(<TaskListScreen kind="today" />);
      await screen.findByRole('checkbox', { name: 'Later task' });
      const rowRenders = rendersOf(dated.id);
      const labelReads = metaSpy.mock.calls.length;

      await act(async () => jest.advanceTimersByTime(NOW_REFRESH_MS * 3));

      // Control: the list did re-render with the new clock (labels were recomputed) ...
      expect(metaSpy.mock.calls.length).toBeGreaterThan(labelReads);
      // ... but the row, whose label is unchanged, did not.
      expect(rendersOf(dated.id)).toBe(rowRenders);
    } finally {
      jest.useRealTimers();
    }
  });

  it('scrolling a long list re-renders none of the rows already on screen (AC3)', async () => {
    const today = startOfLocalDay(Date.now());
    const ids = Array.from(
      { length: 120 },
      (_, i) =>
        createTask(getDb(), { title: `Task ${i}`, dueAt: addLocalDays(today, (i % 20) + 2) }).id,
    );
    await renderWithQuery(<TaskListScreen kind="today" />);
    await screen.findByTestId('today-section-later');
    const mounted = ids.filter((id) => rendersOf(id) > 0);
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(ids.length);
    const before = new Map(mounted.map((id) => [id, rendersOf(id)]));

    // Jest has no layout: give the list its viewport and content size, as the native side does.
    const list = screen.getByTestId('today-list');
    await fireEvent(list, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
    });
    await fireEvent(list, 'contentSizeChange', 390, 8000);
    for (const y of [600, 1800, 3600]) {
      await fireEvent.scroll(screen.getByTestId('today-list'), {
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { width: 390, height: 8000 },
          layoutMeasurement: { width: 390, height: 844 },
        },
      });
    }

    // Control: the scroll was processed (rows further down were mounted) ...
    await waitFor(() =>
      expect(ids.filter((id) => rendersOf(id) > 0).length).toBeGreaterThan(mounted.length),
    );
    // ... and none of the rows already mounted rendered again.
    for (const [id, count] of before) expect(rendersOf(id)).toBe(count);
  });

  it('uses the tuned virtualisation settings', () => {
    expect(LIST_TUNING).toEqual({
      initialNumToRender: 16,
      windowSize: 11,
      maxToRenderPerBatch: 8,
      updateCellsBatchingPeriod: 50,
      removeClippedSubviews: false, // Jest runs as iOS; true on Android
    });
  });
});
