import { appliedMigrationCount, listTables } from './introspect';
import { createMigrationFixture } from './migration-fixtures';
import { findDataLoss, seedEveryTable, snapshot } from './migration-safety';
import { MIGRATIONS_FOLDER, migrateNodeDb, openNodeDb, readJournal } from './node-client';

/**
 * TB-21 AC2: a DB at version k-1 with data (live and soft-deleted rows in every table) is
 * migrated to k. Returns every data-loss problem found (empty = no loss).
 */
function checkMigrationStep(k: number, folder = MIGRATIONS_FOLDER): string[] {
  const { db, sqlite, close } = openNodeDb();
  try {
    migrateNodeDb(db, { count: k, folder });
    const seeded = seedEveryTable(sqlite);
    for (const ids of Object.values(seeded)) expect(ids.length).toBeGreaterThan(0);
    const softDeleted = sqlite
      .prepare('SELECT count(*) AS n FROM tasks WHERE deleted_at IS NOT NULL')
      .get() as { n: number };
    expect(softDeleted.n).toBeGreaterThan(0);
    const before = snapshot(sqlite);

    migrateNodeDb(db, { count: k + 1, folder });

    return findDataLoss(before, snapshot(sqlite));
  } finally {
    close();
  }
}

const SUBTASKS_REBUILD = [
  'CREATE TABLE `__new_subtasks` (`id` text PRIMARY KEY NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, `deleted_at` integer, `task_id` text NOT NULL, `title` text NOT NULL, `is_done` integer DEFAULT false NOT NULL, `sort_order` real DEFAULT 0 NOT NULL, `synced_updated_at` integer, FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`))',
];

// Every real migration k >= 1 in drizzle/ is checked, so new migrations are covered automatically.
const journal = readJournal();
const steps = journal.slice(1).map((entry, i) => ({ k: i + 1, tag: entry.tag }));

describe('migration safety (no rows lost)', () => {
  it('has at least one upgrade step to check', () => {
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });

  it.each(steps)('migration $k ($tag) keeps every row of version k-1', ({ k }) => {
    expect(checkMigrationStep(k)).toEqual([]);
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

describe('migration safety harness against fixture migrations', () => {
  const next = journal.length; // index of the fixture migration

  it('fails a destructive migration (table rebuilt without copying rows, column dropped)', () => {
    const fixture = createMigrationFixture([
      {
        tag: '9000_destructive',
        statements: [
          ...SUBTASKS_REBUILD,
          'DROP TABLE `subtasks`',
          'ALTER TABLE `__new_subtasks` RENAME TO `subtasks`',
          'ALTER TABLE `tasks` DROP COLUMN `notes`',
        ],
      },
    ]);
    try {
      expect(checkMigrationStep(next, fixture.folder)).toEqual([
        'subtasks: 6 rows before, 0 after',
        'subtasks: id checksum changed',
        'tasks.notes: column dropped',
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('passes a lossless rebuild of a leaf table that copies its rows', () => {
    const fixture = createMigrationFixture([
      {
        tag: '9000_lossless_rebuild',
        statements: [
          ...SUBTASKS_REBUILD,
          'INSERT INTO `__new_subtasks` SELECT `id`, `created_at`, `updated_at`, `deleted_at`, `task_id`, `title`, `is_done`, `sort_order`, `synced_updated_at` FROM `subtasks`',
          'DROP TABLE `subtasks`',
          'ALTER TABLE `__new_subtasks` RENAME TO `subtasks`',
          'CREATE INDEX `subtasks_task_id_idx` ON `subtasks` (`task_id`)',
        ],
      },
    ]);
    try {
      expect(checkMigrationStep(next, fixture.folder)).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });
});

describe('migration atomicity (failure mid-way leaves no partial schema)', () => {
  it('rolls back a failing migration entirely, then succeeds on retry once fixed', () => {
    const failing = createMigrationFixture([
      {
        tag: '9000_fails_midway',
        statements: [
          'CREATE TABLE `partial_marker` (`id` text PRIMARY KEY NOT NULL)',
          'CREATE INDEX `partial_idx` ON `tasks` (`title`)',
          'INSERT INTO `no_such_table` VALUES (1)',
        ],
      },
    ]);
    const { db, sqlite, close } = openNodeDb();
    try {
      // App update path: the device already has every shipped migration, with data.
      migrateNodeDb(db, { count: journal.length });
      seedEveryTable(sqlite);
      const before = snapshot(sqlite);

      expect(() => migrateNodeDb(db, { folder: failing.folder })).toThrow();

      expect(listTables(db)).not.toContain('partial_marker');
      const indexes = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'partial_idx'")
        .all();
      expect(indexes).toEqual([]);
      expect(appliedMigrationCount(db)).toBe(journal.length);
      expect(findDataLoss(before, snapshot(sqlite))).toEqual([]);

      // Retry with the shipped (fixed) migrations: nothing pending, DB intact.
      migrateNodeDb(db);
      expect(appliedMigrationCount(db)).toBe(journal.length);
    } finally {
      close();
      failing.cleanup();
    }
  });

  it('rolls back a first-launch failure so no app table is left behind', () => {
    const failing = createMigrationFixture([
      { tag: '9000_fails', statements: ['INSERT INTO `no_such_table` VALUES (1)'] },
    ]);
    const { db, close } = openNodeDb();
    try {
      expect(() => migrateNodeDb(db, { folder: failing.folder })).toThrow();
      expect(listTables(db)).toEqual([]);
      expect(appliedMigrationCount(db)).toBe(0);
    } finally {
      close();
      failing.cleanup();
    }
  });
});
