import { z, ZodError } from 'zod';

import { decodePreference, definePreference, encodePreference } from './define-preference';
import { PREFERENCES } from './index';

const capacity = definePreference<number>({
  key: 'test.capacity-hours',
  schema: z.number().int().min(1).max(16),
  defaultValue: 5,
});

describe('definePreference', () => {
  it('rejects a key that is not dotted lowercase', () => {
    for (const key of ['theme', 'Appearance.Theme', 'a..b', 'a.b c', '.a']) {
      expect(() => definePreference({ key, schema: z.string(), defaultValue: 'x' })).toThrow(
        /Invalid preference key/,
      );
    }
  });

  it('rejects a default that does not match the schema', () => {
    expect(() =>
      definePreference({ key: 'test.bad-default', schema: z.number().min(1), defaultValue: 0 }),
    ).toThrow(/does not match its schema/);
  });
});

describe('decodePreference (stored value → value, safe defaults)', () => {
  it('returns the stored value when it is valid', () => {
    expect(decodePreference(capacity, '8')).toBe(8);
  });

  it.each([
    ['missing (no row)', undefined],
    ['null', null],
    ['malformed JSON', '{not json'],
    ['wrong type', '"eight"'],
    ['out of range', '40'],
    ['empty string', ''],
  ])('returns the default for a %s value', (_label, raw) => {
    expect(decodePreference(capacity, raw)).toBe(5);
  });
});

describe('encodePreference', () => {
  it('stores JSON text', () => {
    expect(encodePreference(capacity, 6)).toBe('6');
  });

  it('throws a ZodError for an invalid value', () => {
    expect(() => encodePreference(capacity, 0)).toThrow(ZodError);
  });
});

describe('preference registry', () => {
  it('has unique keys, each default valid against its schema', () => {
    const keys = PREFERENCES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preference of PREFERENCES) {
      expect(preference.schema.safeParse(preference.defaultValue).success).toBe(true);
    }
  });

  it('registers the appearance theme, defaulting to the system scheme', () => {
    expect(PREFERENCES).toContainEqual(
      expect.objectContaining({ key: 'appearance.theme', defaultValue: 'system' }),
    );
  });
});
