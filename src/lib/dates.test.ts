import {
  addLocalDays,
  atLocalTime,
  formatCompletedAt,
  formatDueLabel,
  formatShortDate,
  formatTime,
  hasTimeOfDay,
  localDaysFromToday,
  parseDateInput,
  parseTimeInput,
  startOfLocalDay,
  toDateInput,
  toTimeInput,
} from './dates';

// Built from local-time parts, so the tests hold in any time zone.
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();
const NOW = local(2026, 10, 28, 15, 4); // Wed, Oct 28 2026, 3:04 PM

describe('dates', () => {
  it('finds local midnight and adds calendar days', () => {
    expect(startOfLocalDay(NOW)).toBe(local(2026, 10, 28));
    expect(addLocalDays(NOW, 1)).toBe(local(2026, 10, 29));
    expect(addLocalDays(NOW, 7)).toBe(local(2026, 11, 4));
    expect(addLocalDays(local(2026, 12, 31, 23, 59), 1)).toBe(local(2027, 1, 1));
  });

  it('counts calendar days from today', () => {
    expect(localDaysFromToday(local(2026, 10, 28, 23, 59), NOW)).toBe(0);
    expect(localDaysFromToday(local(2026, 10, 29), NOW)).toBe(1);
    expect(localDaysFromToday(local(2026, 10, 27, 23, 59), NOW)).toBe(-1);
    expect(localDaysFromToday(local(2027, 1, 1), NOW)).toBe(65);
  });

  it('round-trips YYYY-MM-DD', () => {
    expect(toDateInput(NOW)).toBe('2026-10-28');
    expect(toDateInput(local(2026, 1, 5))).toBe('2026-01-05');
    expect(parseDateInput('2026-10-28')).toBe(local(2026, 10, 28));
    expect(parseDateInput(' 2026-01-05 ')).toBe(local(2026, 1, 5));
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-5', 'tomorrow', '', '2026-10-28T10:00'])(
    'rejects %p as a date',
    (value) => {
      expect(parseDateInput(value)).toBeNull();
    },
  );

  it('formats short dates and times', () => {
    expect(formatShortDate(local(2026, 10, 30), NOW)).toBe('Oct 30');
    expect(formatShortDate(local(2027, 1, 2), NOW)).toBe('Jan 2, 2027');
    expect(formatTime(local(2026, 10, 28, 0, 5))).toBe('12:05 AM');
    expect(formatTime(local(2026, 10, 28, 12, 0))).toBe('12:00 PM');
    expect(formatTime(NOW)).toBe('3:04 PM');
  });

  it('labels due dates relative to today', () => {
    expect(formatDueLabel(local(2026, 10, 28), NOW)).toBe('Today');
    expect(formatDueLabel(local(2026, 10, 29), NOW)).toBe('Tomorrow');
    expect(formatDueLabel(local(2026, 10, 27), NOW)).toBe('Overdue · Oct 27');
    expect(formatDueLabel(local(2026, 10, 30), NOW)).toBe('Fri, Oct 30');
  });

  it('formats the completion timestamp', () => {
    expect(formatCompletedAt(NOW, NOW)).toBe('Completed Oct 28, 3:04 PM');
  });

  // TB-40: due times.
  it('tells a due time from a date-only due date', () => {
    expect(hasTimeOfDay(local(2026, 10, 28))).toBe(false);
    expect(hasTimeOfDay(local(2026, 10, 28, 0, 1))).toBe(true);
    expect(hasTimeOfDay(local(2026, 10, 28, 15, 4))).toBe(true);
  });

  it('parses and formats 24-hour times', () => {
    expect(parseTimeInput('09:30')).toBe(9 * 60 + 30);
    expect(parseTimeInput(' 9:05 ')).toBe(9 * 60 + 5);
    expect(parseTimeInput('23:59')).toBe(23 * 60 + 59);
    expect(parseTimeInput('00:00')).toBe(0);
    for (const bad of ['24:00', '12:60', '9', '9:5', 'noon', '', '12:30 PM']) {
      expect(parseTimeInput(bad)).toBeNull();
    }
    expect(toTimeInput(local(2026, 10, 28, 7, 5))).toBe('07:05');
  });

  it('puts a time of day on a date', () => {
    expect(atLocalTime(local(2026, 10, 28), 15 * 60 + 4)).toBe(NOW);
    expect(atLocalTime(local(2026, 10, 28, 18), 0)).toBe(local(2026, 10, 28));
    expect(() => atLocalTime(NOW, 24 * 60)).toThrow(RangeError);
    expect(() => atLocalTime(NOW, -1)).toThrow(RangeError);
  });

  it('adds the due time to the due label', () => {
    expect(formatDueLabel(local(2026, 10, 28, 15, 30), NOW)).toBe('Today, 3:30 PM');
    expect(formatDueLabel(local(2026, 10, 29, 9), NOW)).toBe('Tomorrow, 9:00 AM');
    expect(formatDueLabel(local(2026, 10, 27, 8, 15), NOW)).toBe('Overdue · Oct 27, 8:15 AM');
  });
});
