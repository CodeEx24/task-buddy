// Planning constraints (TB-33): the user's work hours and daily capacity, as the daily planner
// (TB-34) receives them. Shared by the app (settings page, local storage) and, later, the
// ai-gateway `/plan` request. Runtime-agnostic: imports only `zod`.
//
// Times are 24-hour `HH:MM` wall-clock strings, the same format as TB-24's plan blocks, so a plan
// can be checked against the work hours without conversion. Every value is on a 15-minute step.
import { z } from 'zod';

/** Every time and capacity value is a multiple of this many minutes. */
export const PLANNING_STEP_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;
/** Smallest daily capacity: one step. */
export const MIN_CAPACITY_MINUTES = PLANNING_STEP_MINUTES;

export const WORK_HOURS_ORDER_MESSAGE = 'End time must be after start time.';
export const CAPACITY_OVER_SPAN_MESSAGE = 'Capacity can’t be longer than your work hours.';

const CLOCK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `HH:MM` → minutes after midnight. Expects a valid clock time. */
export function clockTimeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minutes after midnight (0–1439) → `HH:MM`. */
export function minutesToClockTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** 24-hour `HH:MM` on a 15-minute step (`09:00`, `17:45`). */
export const planningClockTimeSchema = z
  .string()
  .regex(CLOCK_TIME_RE, 'Expected a 24-hour time "HH:MM"')
  .refine((time) => clockTimeToMinutes(time) % PLANNING_STEP_MINUTES === 0, {
    message: `Times are in ${PLANNING_STEP_MINUTES}-minute steps`,
  });

/**
 * Work hours within one day: `end` strictly after `start`. Overnight shifts (end before start)
 * are not supported yet (TB-33 AC2 blocks them).
 */
export const workHoursSchema = z
  .strictObject({ start: planningClockTimeSchema, end: planningClockTimeSchema })
  .refine(({ start, end }) => clockTimeToMinutes(end) > clockTimeToMinutes(start), {
    path: ['end'],
    message: WORK_HOURS_ORDER_MESSAGE,
  });
export type WorkHours = z.infer<typeof workHoursSchema>;

/** Length of the work hours in minutes. */
export function workHoursSpanMinutes({ start, end }: WorkHours): number {
  return clockTimeToMinutes(end) - clockTimeToMinutes(start);
}

/** What the planner needs to fit a day: when the user works and how much focused work fits. */
export const planningConstraintsSchema = z
  .strictObject({
    workHours: workHoursSchema,
    /** Plannable minutes per day; at most the work-hours span. */
    capacityMinutes: z
      .int()
      .min(MIN_CAPACITY_MINUTES)
      .max(MINUTES_PER_DAY)
      .multipleOf(PLANNING_STEP_MINUTES),
  })
  // Zod 4 runs this even when `workHours` already failed; an invalid range (span ≤ 0) is reported
  // on `end` only, never as a second, misleading capacity error.
  .refine(
    ({ workHours, capacityMinutes }) => {
      const span = workHoursSpanMinutes(workHours);
      return span <= 0 || capacityMinutes <= span;
    },
    {
      path: ['capacityMinutes'],
      message: CAPACITY_OVER_SPAN_MESSAGE,
    },
  );
export type PlanningConstraints = z.infer<typeof planningConstraintsSchema>;

/** Applied for users who never set their work hours: 09:00–17:00 with 6 hours of capacity. */
export const DEFAULT_PLANNING_CONSTRAINTS: PlanningConstraints = Object.freeze({
  workHours: Object.freeze({ start: '09:00', end: '17:00' }),
  capacityMinutes: 6 * 60,
});
