/**
 * Validation for the `id` route param of `/task/[id]` (TB-18).
 *
 * The param comes from deep links (`taskbuddy://task/<id>`), so it is untrusted input. Only
 * letters, digits and hyphens are accepted, which covers UUIDv7 task ids (TB-21) without coupling
 * to their exact format. Never log the raw value.
 */

export const MAX_TASK_ID_LENGTH = 64;

export const TASK_ID_PATTERN = new RegExp(`^[A-Za-z0-9-]{1,${MAX_TASK_ID_LENGTH}}$`);

export type TaskIdParseResult = { ok: true; id: string } | { ok: false };

/** Parses the raw Expo Router param (a string, or an array for repeated params). Pure. */
export function parseTaskIdParam(raw: string | string[] | undefined): TaskIdParseResult {
  const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;
  if (value === undefined || !TASK_ID_PATTERN.test(value)) {
    return { ok: false };
  }
  return { ok: true, id: value };
}
