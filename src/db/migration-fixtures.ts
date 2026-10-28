/// <reference types="node" />
// Test-only: builds a temporary migrations folder = the real drizzle/ folder plus extra
// hand-written migrations, so tests can prove what the harness and migrator do with them.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MIGRATIONS_FOLDER, readJournal, type JournalEntry } from './node-client';

export type FixtureMigration = { tag: string; statements: string[] };

export function createMigrationFixture(extra: FixtureMigration[]): {
  folder: string;
  cleanup: () => void;
} {
  const folder = mkdtempSync(join(tmpdir(), 'tb-migration-fixture-'));
  cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] };
  const entries = readJournal(folder);
  let when = entries[entries.length - 1]?.when ?? 0;
  for (const migration of extra) {
    when += 1000;
    entries.push({ idx: entries.length, when, tag: migration.tag, breakpoints: true });
    writeFileSync(
      join(folder, `${migration.tag}.sql`),
      migration.statements.join('\n--> statement-breakpoint\n'),
    );
  }
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries }, null, 2));
  return { folder, cleanup: () => rmSync(folder, { recursive: true, force: true }) };
}
