import { sql } from 'drizzle-orm';

import type { TaskBuddyDb } from './types';

export const APP_TABLES = ['lists', 'tasks', 'subtasks', 'tags', 'task_tags'] as const;
/** Device-only tables without sync columns (TB-43: owner and pull cursors). */
export const LOCAL_ONLY_TABLES = ['sync_meta'] as const;
/** Every table the migrations create, sorted like `listTables`. */
export const ALL_TABLES = [...APP_TABLES, ...LOCAL_ONLY_TABLES].sort();
export const SYNC_COLUMNS = ['id', 'created_at', 'updated_at', 'deleted_at'] as const;

export type ColumnInfo = { name: string; type: string; notnull: number; pk: number };

/** User tables in the DB (excludes SQLite internals and Drizzle's migration ledger). */
export function listTables(db: TaskBuddyDb): string[] {
  const rows = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name`,
  );
  return rows.map((r) => r.name);
}

/** Column metadata; `table` must be one of APP_TABLES (never user input). */
export function tableColumns(db: TaskBuddyDb, table: (typeof APP_TABLES)[number]): ColumnInfo[] {
  return db.all<ColumnInfo>(sql`SELECT name, type, "notnull", pk FROM pragma_table_info(${table})`);
}

export function appliedMigrationCount(db: TaskBuddyDb): number {
  const row = db.get<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`);
  return row?.n ?? 0;
}
