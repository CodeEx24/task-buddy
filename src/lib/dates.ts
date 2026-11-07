// Local-calendar date helpers (TB-26). A due date is stored as epoch ms: local midnight for a
// date-only due date, any other minute of that day for a due time (TB-40, spec D1). "Today" and
// "tomorrow" follow the device's time zone. Pure: `now` is passed in.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT_PATTERN = /^(\d{1,2}):(\d{2})$/;
const MINUTES_PER_DAY = 24 * 60;

/** Epoch ms of local midnight on the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local midnight `days` calendar days after the day containing `ms` (DST-safe). */
export function addLocalDays(ms: number, days: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/** Whole local calendar days from `now`'s day to `ms`'s day (negative = in the past). */
export function localDaysFromToday(ms: number, now: number): number {
  const start = new Date(startOfLocalDay(now));
  const target = new Date(startOfLocalDay(ms));
  // Compare as UTC dates so a DST shift (23 h or 25 h day) still counts as one day.
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(target) - utc(start)) / 86_400_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` for the local day containing `ms`. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for a `YYYY-MM-DD` string, or `null` if it is not a real calendar date. */
export function parseDateInput(value: string): number | null {
  const match = DATE_INPUT_PATTERN.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Rejects overflow such as 2026-02-30 (which Date rolls into March).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

/**
 * TB-40: whether `ms` carries a time of day. Date-only due dates sit exactly on local midnight, so
 * any other instant is a due time (and gets a reminder).
 */
export function hasTimeOfDay(ms: number): boolean {
  return startOfLocalDay(ms) !== ms;
}

/** Minutes after local midnight for `H:MM` / `HH:MM` (24-hour), or `null` if it is not a time. */
export function parseTimeInput(value: string): number | null {
  const match = TIME_INPUT_PATTERN.exec(value.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `HH:MM` (24-hour) for the local time of `ms`. */
export function toTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The instant `minutes` after local midnight on the day containing `dayMs` (DST-safe). */
export function atLocalTime(dayMs: number, minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new RangeError('minutes must be a whole number within one day');
  }
  const d = new Date(dayMs);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  ).getTime();
}

/** `Oct 28`, with the year when it differs from `now`'s year. */
export function formatShortDate(ms: number, now: number): string {
  const d = new Date(ms);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** `3:04 PM` in local time. */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const hours = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${hours}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/**
 * Due-date label for a task row: Today, Tomorrow, `Overdue · Oct 27`, or `Fri, Oct 30`. A due time
 * (TB-40) is appended: `Today, 3:04 PM`.
 */
export function formatDueLabel(dueAt: number, now: number): string {
  const days = localDaysFromToday(dueAt, now);
  let label: string;
  if (days === 0) label = 'Today';
  else if (days === 1) label = 'Tomorrow';
  else if (days < 0) label = `Overdue · ${formatShortDate(dueAt, now)}`;
  else label = `${WEEKDAYS[new Date(dueAt).getDay()]}, ${formatShortDate(dueAt, now)}`;
  return hasTimeOfDay(dueAt) ? `${label}, ${formatTime(dueAt)}` : label;
}

/** `Completed Oct 28, 3:04 PM`. */
export function formatCompletedAt(completedAt: number, now: number): string {
  return `Completed ${formatShortDate(completedAt, now)}, ${formatTime(completedAt)}`;
}
