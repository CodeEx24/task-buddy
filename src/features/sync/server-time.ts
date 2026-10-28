// Server timestamps (Postgres timestamptz as text, microsecond precision) for the pull cursor.
// Compared as numbers, so the comparison never depends on how many fraction digits were printed.

const TIMESTAMP_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/** Microseconds since the epoch, or null if `value` isn't a timestamp Postgres would print. */
export function parseServerTimestamp(value: string): number | null {
  const match = TIMESTAMP_RE.exec(value);
  if (!match) return null;
  const [, date, time, fraction = '', zone = 'Z'] = match;
  const offset =
    zone === 'Z'
      ? 'Z'
      : zone.length === 3
        ? `${zone}:00`
        : zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(`${date}T${time}${offset}`);
  if (Number.isNaN(ms)) return null;
  return ms * 1000 + Number(fraction.padEnd(6, '0'));
}

/** Negative, zero or positive like a sort comparator. Unparseable values compare as text. */
export function compareServerTimestamps(a: string, b: string): number {
  const x = parseServerTimestamp(a);
  const y = parseServerTimestamp(b);
  if (x === null || y === null) return a < b ? -1 : a > b ? 1 : 0;
  return x - y;
}

/** `value` moved back by `ms` milliseconds, as an ISO string (millisecond precision, rounded down). */
export function serverTimestampMinus(value: string, ms: number): string {
  const micros = parseServerTimestamp(value);
  if (micros === null) return value;
  return new Date(Math.floor(micros / 1000) - ms).toISOString();
}
