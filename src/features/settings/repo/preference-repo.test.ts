/// <reference types="node" />
import { eq, sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z, ZodError } from 'zod';

import { openMigratedNodeDb, openNodeDb, migrateNodeDb, type NodeDb } from '@/db/node-client';
import { preferences } from '@/db/schema';
import { RepoError } from '@/features/tasks/repo/repo-utils';
import { installTestClock } from '@/features/tasks/repo/test-clock';

import { appearanceThemePreference } from '../preferences/appearance';
import { definePreference } from '../preferences/define-preference';
import { readPreference, resetPreference, writePreference } from './preference-repo';

const clock = installTestClock();

const workHours = definePreference({
  key: 'test.work-hours',
  schema: z
    .object({ start: z.string(), end: z.string() })
    .refine((hours) => hours.end > hours.start, { message: 'End must be after start' }),
  defaultValue: { start: '09:00', end: '17:00' },
});

let handle: NodeDb;
beforeEach(() => {
  handle = openMigratedNodeDb();
});
afterEach(() => handle.close());

const rowsFor = (key: string) =>
  handle.db.select().from(preferences).where(eq(preferences.key, key)).all();

describe('preference repository (TB-32)', () => {
  it('reads the default when nothing is stored', () => {
    expect(readPreference(handle.db, appearanceThemePreference)).toBe('system');
    expect(readPreference(handle.db, workHours)).toEqual({ start: '09:00', end: '17:00' });
  });

  it('writes a value (UUIDv7 id, timestamps) and reads it back', () => {
    expect(writePreference(handle.db, appearanceThemePreference, 'dark')).toBe('dark');

    expect(readPreference(handle.db, appearanceThemePreference)).toBe('dark');
    const [row] = rowsFor('appearance.theme');
    expect(row).toMatchObject({
      value: '"dark"',
      createdAt: clock.now(),
      updatedAt: clock.now(),
      deletedAt: null,
    });
    expect(row?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('updates the same row on a second write and bumps updated_at only', () => {
    writePreference(handle.db, appearanceThemePreference, 'dark');
    const created = clock.now();
    const updated = clock.advance();
    writePreference(handle.db, appearanceThemePreference, 'light');

    const rows = rowsFor('appearance.theme');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: '"light"', createdAt: created, updatedAt: updated });
  });

  it('stores object values as JSON', () => {
    writePreference(handle.db, workHours, { start: '08:30', end: '16:30' });
    expect(readPreference(handle.db, workHours)).toEqual({ start: '08:30', end: '16:30' });
  });

  it('rejects an invalid value with a ZodError and stores nothing', () => {
    expect(() => writePreference(handle.db, workHours, { start: '17:00', end: '09:00' })).toThrow(
      ZodError,
    );
    // An unknown enum value at runtime (e.g. from a stale caller) is rejected too.
    expect(() =>
      writePreference(handle.db, appearanceThemePreference, 'sepia' as unknown as 'dark'),
    ).toThrow(ZodError);
    expect(rowsFor('test.work-hours')).toEqual([]);
    expect(rowsFor('appearance.theme')).toEqual([]);
  });

  it('falls back to the default for a corrupt or out-of-date stored value', () => {
    const insert = (value: string) =>
      handle.sqlite
        .prepare(
          "INSERT INTO preferences (id, created_at, updated_at, key, value) VALUES ('p1', 1, 1, 'appearance.theme', ?)",
        )
        .run(value);
    insert('{broken');
    expect(readPreference(handle.db, appearanceThemePreference)).toBe('system');

    handle.sqlite.prepare("UPDATE preferences SET value = '\"sepia\"' WHERE id = 'p1'").run();
    expect(readPreference(handle.db, appearanceThemePreference)).toBe('system');

    // Writing a valid value repairs the row in place.
    writePreference(handle.db, appearanceThemePreference, 'light');
    expect(rowsFor('appearance.theme')).toEqual([expect.objectContaining({ id: 'p1' })]);
    expect(readPreference(handle.db, appearanceThemePreference)).toBe('light');
  });

  it('reset soft-deletes the row so the default applies, and a later write adds a new row', () => {
    writePreference(handle.db, appearanceThemePreference, 'dark');
    const resetAt = clock.advance();

    expect(resetPreference(handle.db, appearanceThemePreference)).toBe('system');
    expect(readPreference(handle.db, appearanceThemePreference)).toBe('system');
    expect(rowsFor('appearance.theme')).toEqual([
      expect.objectContaining({ deletedAt: resetAt, updatedAt: resetAt }),
    ]);

    writePreference(handle.db, appearanceThemePreference, 'light');
    expect(readPreference(handle.db, appearanceThemePreference)).toBe('light');
    expect(rowsFor('appearance.theme')).toHaveLength(2);
  });

  it('allows only one live row per key (DB-level unique index)', () => {
    const insert = handle.sqlite.prepare(
      "INSERT INTO preferences (id, created_at, updated_at, deleted_at, key, value) VALUES (?, 1, 1, ?, 'appearance.theme', '\"dark\"')",
    );
    insert.run('p1', null);
    insert.run('p-deleted', 5); // soft-deleted rows don't count
    expect(() => insert.run('p2', null)).toThrow(/UNIQUE constraint failed/);
  });

  it('wraps driver failures in a RepoError without the stored value', () => {
    handle.db.run(sql`DROP TABLE preferences`);
    let caught: unknown;
    try {
      writePreference(handle.db, workHours, { start: '07:00', end: '15:00' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RepoError);
    expect((caught as RepoError).code).toBe('DB_FAILURE');
    expect(String((caught as RepoError).message)).not.toContain('07:00');
  });

  it('persists across closing and reopening the database file (app restart)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tb-prefs-'));
    const file = join(dir, 'taskbuddy.db');
    try {
      const first = openNodeDb(file);
      migrateNodeDb(first.db);
      writePreference(first.db, appearanceThemePreference, 'dark');
      first.close();

      const second = openNodeDb(file);
      migrateNodeDb(second.db);
      expect(readPreference(second.db, appearanceThemePreference)).toBe('dark');
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
