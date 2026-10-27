import { findDataLoss, seedEveryTable, snapshot } from './migration-safety';
import { migrateNodeDb, openNodeDb, readJournal } from './node-client';

// TB-21 AC2: given a database at version k-1 with data, migration k loses no rows.
// Runs for every migration k >= 1 in drizzle/, so new migrations are covered automatically.
const journal = readJournal();
const steps = journal.slice(1).map((entry, i) => ({ k: i + 1, tag: entry.tag }));

describe('migration safety (no rows lost)', () => {
  it('has at least one upgrade step to check', () => {
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });

  it.each(steps)('migration $k ($tag) keeps every row of version k-1', ({ k }) => {
    const { db, sqlite, close } = openNodeDb();
    migrateNodeDb(db, { count: k });
    const seeded = seedEveryTable(sqlite);
    // Every table got rows, including soft-deleted ones.
    for (const ids of Object.values(seeded)) expect(ids.length).toBeGreaterThan(0);
    const softDeleted = sqlite
      .prepare('SELECT count(*) AS n FROM tasks WHERE deleted_at IS NOT NULL')
      .get() as {
      n: number;
    };
    expect(softDeleted.n).toBeGreaterThan(0);
    const before = snapshot(sqlite);

    migrateNodeDb(db, { count: k + 1 });

    expect(findDataLoss(before, snapshot(sqlite))).toEqual([]);
    close();
  });

  it('detects loss (self-check of the comparator)', () => {
    const { db, sqlite, close } = openNodeDb();
    migrateNodeDb(db);
    seedEveryTable(sqlite);
    const before = snapshot(sqlite);
    sqlite.prepare("DELETE FROM subtasks WHERE id = 'subtasks-0001'").run();
    sqlite.prepare("UPDATE tasks SET notes = NULL WHERE id = 'tasks-0002'").run();

    expect(findDataLoss(before, snapshot(sqlite))).toEqual(
      expect.arrayContaining([
        'subtasks: 6 rows before, 5 after',
        'subtasks: id checksum changed',
        'tasks.notes: value changed for row tasks-0002',
      ]),
    );
    close();
  });
});
