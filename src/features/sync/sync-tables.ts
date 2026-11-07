// The tables TB-43 syncs, in parent → child order (push and pull follow this order so foreign
// keys always resolve), and the boundary schemas for rows coming back from the server.
// Tags and task tags stay device-only until TB-44 decides how duplicate names merge (spec D1).
import { z } from 'zod';

import { lists, subtasks, tasks } from '@/db/schema';

export const SYNC_TABLE_NAMES = ['lists', 'tasks', 'subtasks'] as const;
export type SyncTableName = (typeof SYNC_TABLE_NAMES)[number];

export const SYNC_TABLES = { lists, tasks, subtasks } as const;

const id = z.uuid();
const epochMs = z.number().int().nonnegative();
/** Postgres timestamptz as PostgREST / to_jsonb print it, e.g. 2026-10-28T18:17:51.932733+00:00. */
const serverTimestamp = z.string().min(20).max(40);

const base = {
  id,
  created_at: epochMs,
  updated_at: epochMs,
  deleted_at: epochMs.nullable(),
  server_updated_at: serverTimestamp,
};

// Mirrors the Postgres CHECK constraints (supabase/migrations/*_offline_sync_tables.sql) and
// the device's input limits (features/tasks/schema.ts). Unknown keys (user_id) are stripped.
export const serverRowSchemas = {
  lists: z.object({
    ...base,
    name: z.string().min(1).max(100),
    color: z.string().min(1).max(32).nullable(),
    sort_order: z.number(),
  }),
  tasks: z.object({
    ...base,
    list_id: id.nullable(),
    title: z.string().min(1).max(500),
    notes: z.string().max(10_000).nullable(),
    status: z.enum(['open', 'done']),
    priority: z.number().int().min(0).max(3),
    due_at: z.number().int().nullable(),
    completed_at: z.number().int().nullable(),
    sort_order: z.number(),
  }),
  subtasks: z.object({
    ...base,
    task_id: id,
    title: z.string().min(1).max(500),
    is_done: z.boolean(),
    sort_order: z.number(),
  }),
} as const;

export type ServerRow<T extends SyncTableName> = z.infer<(typeof serverRowSchemas)[T]>;
export type AnyServerRow = ServerRow<SyncTableName>;

/** A device row as it is pushed: snake_case columns, epoch ms, no sync metadata. */
export type PushRow = Record<string, string | number | boolean | null>;

/** Position in a table's server change feed: (server_updated_at, id). */
export type SyncCursor = { ts: string; id: string };
