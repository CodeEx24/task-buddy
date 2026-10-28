import { ZodError } from 'zod';

import { getDb } from '@/db/client';
import { preferences } from '@/db/schema';
import { planningConstraintsPreference } from '@/features/settings/preferences/planning';
import { writePreference } from '@/features/settings/repo/preference-repo';
import { cleanupTaskTests, resetTaskData } from '@/features/tasks/testing/task-test-utils';
import { newId } from '@/lib/ids';

import { DEFAULT_PLANNING_CONSTRAINTS, getPlanningConstraints } from './planning-constraints';

beforeEach(resetTaskData);
afterEach(cleanupTaskTests);

describe('getPlanningConstraints (TB-33, the planner accessor)', () => {
  it('gives the defaults to a user who never set work hours (AC3)', () => {
    expect(getPlanningConstraints(getDb())).toEqual({
      workHours: { start: '09:00', end: '17:00' },
      capacityMinutes: 360,
    });
    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);
  });

  it('exposes a saved 9:00–17:00 / 5 h to the planner (AC1)', () => {
    const saved = { workHours: { start: '09:00', end: '17:00' }, capacityMinutes: 300 };
    writePreference(getDb(), planningConstraintsPreference, saved);

    expect(getPlanningConstraints(getDb())).toEqual(saved);
  });

  it('never stores an overnight range or a capacity over the span', () => {
    for (const bad of [
      { workHours: { start: '17:00', end: '09:00' }, capacityMinutes: 300 },
      { workHours: { start: '09:00', end: '12:00' }, capacityMinutes: 240 },
    ]) {
      expect(() => writePreference(getDb(), planningConstraintsPreference, bad)).toThrow(ZodError);
    }
    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);
  });

  it('falls back to the defaults when the stored row is invalid', () => {
    const now = Date.now();
    getDb()
      .insert(preferences)
      .values({
        id: newId(),
        key: 'planner.constraints',
        value: JSON.stringify({ workHours: { start: '18:00', end: '08:00' }, capacityMinutes: 60 }),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(getPlanningConstraints(getDb())).toEqual(DEFAULT_PLANNING_CONSTRAINTS);
  });
});
