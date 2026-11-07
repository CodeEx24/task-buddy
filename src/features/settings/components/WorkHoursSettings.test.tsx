import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { sql } from 'drizzle-orm';
import { Text } from 'react-native';

import { getDb } from '@/db/client';
import { usePlanningConstraints } from '@/features/plan/hooks/use-planning-constraints';
import {
  DEFAULT_PLANNING_CONSTRAINTS,
  getPlanningConstraints,
} from '@/features/plan/planning-constraints';
import {
  cleanupTaskTests,
  createTestQueryClient,
  renderWithQuery,
  resetTaskData,
} from '@/features/tasks/testing/task-test-utils';

import {
  CAPACITY_OVER_SPAN_MESSAGE,
  WORK_HOURS_ORDER_MESSAGE,
} from '../../../../packages/schemas/src/planning';
import { planningConstraintsPreference } from '../preferences/planning';
import { writePreference } from '../repo/preference-repo';
import {
  formatClockMinutes,
  formatDuration,
  WORK_HOURS_SAVE_ERROR,
  WORK_HOURS_SAVED,
  WorkHoursSettings,
} from './WorkHoursSettings';

beforeEach(resetTaskData);
afterEach(cleanupTaskTests);

const value = (field: 'start' | 'end' | 'capacity') =>
  screen.getByTestId(`work-hours-${field}-value`);

async function press(name: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await fireEvent.press(screen.getByRole('button', { name }));
  }
}

async function renderPage() {
  const rendered = await renderWithQuery(<WorkHoursSettings />);
  await screen.findByTestId('work-hours-form');
  return rendered;
}

/** Shows what a planner screen would read through `usePlanningConstraints`. */
function PlannerProbe() {
  const { workHours, capacityMinutes } = usePlanningConstraints();
  return (
    <Text testID="planner-probe">{`${workHours.start}-${workHours.end}/${capacityMinutes}`}</Text>
  );
}

describe('Work hours page (TB-33)', () => {
  it('shows the defaults to a user who never set them (AC3)', async () => {
    await renderPage();

    expect(value('start')).toHaveTextContent('9:00');
    expect(value('end')).toHaveTextContent('17:00');
    expect(value('capacity')).toHaveTextContent('6 h');
    expect(screen.getByTestId('work-hours-hint')).toHaveTextContent(/Your work hours are 8 h\./);
    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);
  });

  it('saves 9:00–17:00 with 5 h and exposes it to the planner (AC1)', async () => {
    await renderWithQuery(
      <>
        <PlannerProbe />
        <WorkHoursSettings />
      </>,
    );
    await screen.findByTestId('work-hours-form');
    expect(screen.getByTestId('planner-probe')).toHaveTextContent('09:00-17:00/360');

    await press('Daily capacity 1 hour less');
    expect(value('capacity')).toHaveTextContent('5 h');
    await press('Save');

    expect(await screen.findByText(WORK_HOURS_SAVED)).toBeVisible();
    await waitFor(() =>
      expect(getPlanningConstraints(getDb())).toEqual({
        workHours: { start: '09:00', end: '17:00' },
        capacityMinutes: 300,
      }),
    );
    // The hook the planner UI uses sees the new value at once (shared query cache).
    await waitFor(() =>
      expect(screen.getByTestId('planner-probe')).toHaveTextContent('09:00-17:00/300'),
    );
  });

  it('blocks end before start with an inline error and saves nothing (AC2)', async () => {
    await renderPage();

    await press('End 1 hour earlier', 9);
    expect(value('end')).toHaveTextContent('8:00');

    const error = await screen.findByTestId('work-hours-end-error');
    expect(error).toHaveTextContent(WORK_HOURS_ORDER_MESSAGE);
    expect(error).toHaveProp('accessibilityRole', 'alert');
    // Only the range is wrong: no second, misleading capacity error (review finding 1).
    expect(screen.queryByTestId('work-hours-capacity-error')).toBeNull();

    await press('Save');
    expect(screen.queryByText(WORK_HOURS_SAVED)).toBeNull();
    expect(screen.getByTestId('work-hours-end-error')).toBeVisible();
    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);

    // Fixing the range clears the error.
    await press('End 1 hour later', 2);
    await waitFor(() => expect(screen.queryByTestId('work-hours-end-error')).toBeNull());
  });

  it('blocks an end equal to the start (an empty day)', async () => {
    await renderPage();
    await press('Start 1 hour later', 8);
    expect(value('start')).toHaveTextContent('17:00');
    expect(await screen.findByTestId('work-hours-end-error')).toHaveTextContent(
      WORK_HOURS_ORDER_MESSAGE,
    );
    expect(screen.queryByTestId('work-hours-capacity-error')).toBeNull();

    await press('Save');
    expect(screen.queryByText(WORK_HOURS_SAVED)).toBeNull();
    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);
  });

  it('blocks a capacity longer than the work hours and saves nothing', async () => {
    await renderPage();

    await press('End 1 hour earlier', 3); // 9:00–14:00 = 5 h, capacity still 6 h
    expect(await screen.findByTestId('work-hours-capacity-error')).toHaveTextContent(
      CAPACITY_OVER_SPAN_MESSAGE,
    );
    await press('Save');
    expect(screen.queryByText(WORK_HOURS_SAVED)).toBeNull();
    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);

    await press('Daily capacity 1 hour less');
    await waitFor(() => expect(screen.queryByTestId('work-hours-capacity-error')).toBeNull());
    await press('Save');
    await waitFor(() =>
      expect(getPlanningConstraints(getDb())).toEqual({
        workHours: { start: '09:00', end: '14:00' },
        capacityMinutes: 300,
      }),
    );
  });

  it('opens with the stored value after a restart (new query cache)', async () => {
    writePreference(getDb(), planningConstraintsPreference, {
      workHours: { start: '07:30', end: '15:45' },
      capacityMinutes: 285,
    });

    await renderWithQuery(<WorkHoursSettings />, createTestQueryClient());
    await screen.findByTestId('work-hours-form');

    expect(value('start')).toHaveTextContent('7:30');
    expect(value('end')).toHaveTextContent('15:45');
    expect(value('capacity')).toHaveTextContent('4 h 45 min');
  });

  it('says so when the write fails', async () => {
    await renderPage();
    getDb().run(sql`DROP TABLE preferences`);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Daily capacity 1 hour less' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });

    expect(await screen.findByText(WORK_HOURS_SAVE_ERROR)).toBeVisible();
    expect(screen.queryByText(WORK_HOURS_SAVED)).toBeNull();
  });
});

describe('work hours formatting', () => {
  it.each([
    [0, '0:00'],
    [540, '9:00'],
    [1020, '17:00'],
    [1425, '23:45'],
  ])('formats %i minutes as %s', (minutes, text) => {
    expect(formatClockMinutes(minutes)).toBe(text);
  });

  it.each([
    [15, '15 min'],
    [300, '5 h'],
    [330, '5 h 30 min'],
    [1440, '24 h'],
  ])('formats a duration of %i minutes as %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
