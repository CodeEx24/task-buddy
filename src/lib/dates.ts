// Local-calendar date helpers (TB-26). Due dates are date-only and stored as the epoch ms of local
// midnight, so "today" and "tomorrow" follow the device's time zone. Pure: `now` is passed in.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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

/** Due-date label for a task row: Today, Tomorrow, `Overdue · Oct 27`, or `Fri, Oct 30`. */
export function formatDueLabel(dueAt: number, now: number): string {
  const days = localDaysFromToday(dueAt, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return `Overdue · ${formatShortDate(dueAt, now)}`;
  return `${WEEKDAYS[new Date(dueAt).getDay()]}, ${formatShortDate(dueAt, now)}`;
}

/** `Completed Oct 28, 3:04 PM`. */
export function formatCompletedAt(completedAt: number, now: number): string {
  return `Completed ${formatShortDate(completedAt, now)}, ${formatTime(completedAt)}`;
}
