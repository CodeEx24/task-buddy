import {
  CAPACITY_OVER_SPAN_MESSAGE,
  clockTimeToMinutes,
  DEFAULT_PLANNING_CONSTRAINTS,
  minutesToClockTime,
  planningConstraintsSchema,
  WORK_HOURS_ORDER_MESSAGE,
  workHoursSchema,
  workHoursSpanMinutes,
} from './planning';

const constraints = (start: string, end: string, capacityMinutes: number) => ({
  workHours: { start, end },
  capacityMinutes,
});

describe('planning constraints schema (TB-33)', () => {
  it('accepts 9:00–17:00 with 5 hours of capacity', () => {
    expect(planningConstraintsSchema.parse(constraints('09:00', '17:00', 300))).toEqual(
      constraints('09:00', '17:00', 300),
    );
  });

  it('defaults to 09:00–17:00 and 6 hours, which is valid', () => {
    expect(DEFAULT_PLANNING_CONSTRAINTS).toEqual(constraints('09:00', '17:00', 360));
    expect(planningConstraintsSchema.safeParse(DEFAULT_PLANNING_CONSTRAINTS).success).toBe(true);
  });

  it.each([
    ['end before start (overnight shift)', '22:00', '06:00'],
    ['end equal to start', '09:00', '09:00'],
  ])('rejects %s on the end field', (_label, start, end) => {
    const result = workHoursSchema.safeParse({ start, end });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['end'], message: WORK_HOURS_ORDER_MESSAGE }),
    ]);
  });

  it('reports an invalid range on end only, not also as a capacity error', () => {
    const result = planningConstraintsSchema.safeParse(constraints('17:00', '09:00', 300));
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['workHours', 'end'], message: WORK_HOURS_ORDER_MESSAGE }),
    ]);
  });

  it('rejects capacity longer than the work hours, on the capacity field', () => {
    const result = planningConstraintsSchema.safeParse(constraints('09:00', '12:00', 195));
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['capacityMinutes'], message: CAPACITY_OVER_SPAN_MESSAGE }),
    ]);
    // Exactly the span is fine.
    expect(planningConstraintsSchema.safeParse(constraints('09:00', '12:00', 180)).success).toBe(
      true,
    );
  });

  it.each([
    ['a 12-hour time', constraints('9am', '17:00', 300)],
    ['an hour past 23', constraints('24:00', '17:00', 300)],
    ['a time off the 15-minute step', constraints('09:10', '17:00', 300)],
    ['capacity off the 15-minute step', constraints('09:00', '17:00', 301)],
    ['zero capacity', constraints('09:00', '17:00', 0)],
    ['fractional capacity', constraints('09:00', '17:00', 300.5)],
    ['an unknown key', { ...constraints('09:00', '17:00', 300), timezone: 'UTC' }],
  ])('rejects %s', (_label, value) => {
    expect(planningConstraintsSchema.safeParse(value).success).toBe(false);
  });

  it('converts between HH:MM and minutes', () => {
    expect(clockTimeToMinutes('09:00')).toBe(540);
    expect(clockTimeToMinutes('23:45')).toBe(1425);
    expect(minutesToClockTime(540)).toBe('09:00');
    expect(minutesToClockTime(0)).toBe('00:00');
    expect(minutesToClockTime(1425)).toBe('23:45');
    expect(workHoursSpanMinutes({ start: '09:00', end: '17:00' })).toBe(480);
  });
});
