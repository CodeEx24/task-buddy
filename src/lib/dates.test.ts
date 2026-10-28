import {
  addLocalDays,
  formatCompletedAt,
  formatDueLabel,
  formatShortDate,
  formatTime,
  localDaysFromToday,
  parseDateInput,
  startOfLocalDay,
  toDateInput,
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
});
