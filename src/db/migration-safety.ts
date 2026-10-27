/// <reference types="node" />
// Generic "no rows lost" check for migrations (TB-21 AC2). It seeds whatever tables exist at
// version k-1 by reading the live schema (columns, foreign keys), so every future migration is
// covered without touching this file.
import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

type Column = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};
type ForeignKey = { table: string; from: string; to: string };

export type TableSnapshot = {
  count: number;
  idChecksum: string;
  /** Row values keyed by id, for every column. */
  rows: Map<string, Record<string, unknown>>;
};

const ROWS_PER_TABLE = 6;
const BASE_TIME = 1_790_000_000_000;

/**
 * Allowed values for columns guarded by a CHECK constraint, keyed `table.column`.
 * Add an entry when a migration adds a CHECK, or seeding fails with "CHECK constraint failed".
 */
const CHECKED_COLUMN_VALUES: Record<string, readonly unknown[]> = {
  'tasks.status': ['open', 'done'],
  'tasks.priority': [0, 1, 2, 3],
};

function userTables(sqlite: Database.Database): string[] {
  return (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}

function columnsOf(sqlite: Database.Database, table: string): Column[] {
  return sqlite.prepare('SELECT * FROM pragma_table_info(?)').all(table) as Column[];
}

function foreignKeysOf(sqlite: Database.Database, table: string): ForeignKey[] {
  return sqlite
    .prepare('SELECT "table", "from", "to" FROM pragma_foreign_key_list(?)')
    .all(table) as ForeignKey[];
}

/** Parents before children, so foreign keys resolve while `foreign_keys = ON`. */
function inDependencyOrder(sqlite: Database.Database, tables: string[]): string[] {
  const ordered: string[] = [];
  const visit = (table: string, path: Set<string>) => {
    if (ordered.includes(table) || path.has(table)) return;
    path.add(table);
    for (const fk of foreignKeysOf(sqlite, table)) {
      if (tables.includes(fk.table) && fk.table !== table) visit(fk.table, path);
    }
    ordered.push(table);
  };
  for (const table of tables) visit(table, new Set());
  return ordered;
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

function valueFor(table: string, column: Column, row: number): unknown {
  if (column.name === 'deleted_at') return row % 2 === 1 ? BASE_TIME + row : null; // live + soft-deleted
  if (column.name.endsWith('_at')) return BASE_TIME + row * 1000;
  const allowed = CHECKED_COLUMN_VALUES[`${table}.${column.name}`];
  if (allowed) return allowed[row % allowed.length];
  const type = column.type.toUpperCase();
  if (type.includes('INT')) return row % 2;
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return row + 0.5;
  // Distinct per table/column/row: satisfies unique indexes such as lower(tags.name).
  return `${table}.${column.name}.${row}`;
}

/** Inserts live and soft-deleted rows into every user table. Returns ids per table. */
export function seedEveryTable(sqlite: Database.Database): Record<string, string[]> {
  const tables = inDependencyOrder(sqlite, userTables(sqlite));
  const ids: Record<string, string[]> = {};
  for (const table of tables) {
    const columns = columnsOf(sqlite, table);
    const fks = foreignKeysOf(sqlite, table);
    ids[table] = [];
    const insert = sqlite.prepare(
      `INSERT INTO ${quote(table)} (${columns.map((c) => quote(c.name)).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    );
    for (let row = 0; row < ROWS_PER_TABLE; row++) {
      const id = `${table}-${String(row).padStart(4, '0')}`;
      const values = columns.map((column) => {
        if (column.name === 'id') return id;
        const fk = fks.find((f) => f.from === column.name);
        if (fk) {
          const parents = ids[fk.table] ?? [];
          // Distinct parent per row keeps (task_id, tag_id)-style unique indexes satisfied.
          return parents.length ? parents[row % parents.length] : null;
        }
        return valueFor(table, column, row);
      });
      insert.run(...values);
      ids[table].push(id);
    }
  }
  return ids;
}

export function snapshot(sqlite: Database.Database): Record<string, TableSnapshot> {
  const result: Record<string, TableSnapshot> = {};
  for (const table of userTables(sqlite)) {
    const rows = sqlite.prepare(`SELECT * FROM ${quote(table)} ORDER BY id`).all() as Record<
      string,
      unknown
    >[];
    const ids = rows.map((r) => String(r.id));
    result[table] = {
      count: rows.length,
      idChecksum: createHash('sha256').update(ids.join('\n')).digest('hex'),
      rows: new Map(rows.map((r) => [String(r.id), r])),
    };
  }
  return result;
}

/**
 * Lists every difference that means data was lost between two snapshots: a table that vanished,
 * a changed row count or id set, a dropped column, or a changed value in a surviving column.
 */
export function findDataLoss(
  before: Record<string, TableSnapshot>,
  after: Record<string, TableSnapshot>,
): string[] {
  const problems: string[] = [];
  for (const [table, old] of Object.entries(before)) {
    const now = after[table];
    if (!now) {
      problems.push(`${table}: table missing after migration`);
      continue;
    }
    if (now.count !== old.count)
      problems.push(`${table}: ${old.count} rows before, ${now.count} after`);
    if (now.idChecksum !== old.idChecksum) problems.push(`${table}: id checksum changed`);
    const dropped = new Set<string>();
    for (const [id, oldRow] of old.rows) {
      const newRow = now.rows.get(id);
      if (!newRow) continue; // already reported by count/checksum
      for (const [column, value] of Object.entries(oldRow)) {
        if (!(column in newRow)) dropped.add(column);
        else if (newRow[column] !== value)
          problems.push(`${table}.${column}: value changed for row ${id}`);
      }
    }
    // A dropped column loses data too. An intentional drop must change this harness explicitly.
    for (const column of dropped) problems.push(`${table}.${column}: column dropped`);
  }
  return problems;
}
