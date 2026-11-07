// Preference definitions (TB-32). A preference is a key, a Zod schema and a default. Values are
// stored as JSON text in the local `preferences` table and validated at the boundary in both
// directions: a write must match the schema, and a missing, unreadable or out-of-date stored
// value reads back as the default, so a bad row can never crash a screen.
import type { z } from 'zod';

/** Dotted, lowercase key, e.g. `appearance.theme` or `planner.work-hours`. */
const PREFERENCE_KEY_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export type PreferenceDefinition<T> = {
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly defaultValue: T;
};

/** Declares a preference. Throws at module load if the key or the default is invalid. */
export function definePreference<T>(definition: PreferenceDefinition<T>): PreferenceDefinition<T> {
  if (!PREFERENCE_KEY_RE.test(definition.key)) {
    throw new Error(`Invalid preference key "${definition.key}"`);
  }
  if (!definition.schema.safeParse(definition.defaultValue).success) {
    throw new Error(`Default for preference "${definition.key}" does not match its schema`);
  }
  return Object.freeze({ ...definition });
}

/** Stored JSON text → value. Missing, malformed JSON or a schema mismatch gives the default. */
export function decodePreference<T>(
  definition: PreferenceDefinition<T>,
  raw: string | null | undefined,
): T {
  if (raw === null || raw === undefined) return definition.defaultValue;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return definition.defaultValue;
  }
  const result = definition.schema.safeParse(parsed);
  return result.success ? result.data : definition.defaultValue;
}

/** Value → stored JSON text. Throws a ZodError for a value that does not match the schema. */
export function encodePreference<T>(definition: PreferenceDefinition<T>, value: T): string {
  return JSON.stringify(definition.schema.parse(value));
}
