/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_TABLES,
  appliedMigrationCount,
  listTables,
  SYNC_COLUMNS,
  tableColumns,
} from './introspect';
import { MIGRATIONS_FOLDER, migrateNodeDb, openNodeDb, readJournal } from './node-client';

// TB-21 AC1: on first launch, migrations create the tables with id / updated_at / deleted_at.
describe('local schema (first launch)', () => {
  it('opens an in-memory SQLite DB (driver smoke test)', () => {
    const { sqlite, close } = openNodeDb();
    expect(sqlite.prepare('select 1 as x').get()).toEqual({ x: 1 });
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    close();
  });

  it('applies every migration to an empty DB and creates the 5 tables with sync columns', () => {
    const { db, close } = openNodeDb();
    expect(listTables(db)).toEqual([]);

    migrateNodeDb(db);

    expect(listTables(db)).toEqual([...APP_TABLES].sort());
    expect(appliedMigrationCount(db)).toBe(readJournal().length);
    for (const table of APP_TABLES) {
      const columns = tableColumns(db, table);
      const names = columns.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining([...SYNC_COLUMNS]));
      const id = columns.find((c) => c.name === 'id');
      expect(id).toMatchObject({ type: 'TEXT', pk: 1 });
      expect(columns.find((c) => c.name === 'updated_at')).toMatchObject({
        type: 'INTEGER',
        notnull: 1,
      });
      expect(columns.find((c) => c.name === 'deleted_at')).toMatchObject({
        type: 'INTEGER',
        notnull: 0,
      });
    }
    close();
  });

  it('is idempotent: a second launch applies nothing', () => {
    const { db, close } = openNodeDb();
    migrateNodeDb(db);
    migrateNodeDb(db);
    expect(appliedMigrationCount(db)).toBe(readJournal().length);
    close();
  });

  it('keeps the journal ordered (Drizzle skips a migration whose "when" is not newer)', () => {
    // The migrator applies an entry only if its `when` is later than the last applied one, so an
    // out-of-order timestamp would be skipped silently on devices that already migrated.
    const entries = readJournal();
    entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      const previous = entries[i - 1];
      if (previous) expect(entry.when).toBeGreaterThan(previous.when);
    });
  });

  it('bundles every journal migration for the app (drizzle/migrations.js)', () => {
    // The app imports drizzle/migrations.js (expo driver); a missing entry would skip a migration.
    const bundle = readFileSync(join(MIGRATIONS_FOLDER, 'migrations.js'), 'utf8');
    const exported = bundle.slice(bundle.indexOf('migrations: {'));
    for (const entry of readJournal()) {
      const key = `m${String(entry.idx).padStart(4, '0')}`;
      expect(bundle).toContain(`import ${key} from './${entry.tag}.sql'`);
      expect(exported).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });
});
