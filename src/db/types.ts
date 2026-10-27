import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

export type DbSchema = typeof schema;

/**
 * Driver-agnostic handle the repositories take. The app passes the expo-sqlite database
 * (`@/db/client`), tests pass a better-sqlite3 one (`@/db/node-client`); both are synchronous.
 */
export type TaskBuddyDb = BaseSQLiteDatabase<'sync', unknown, DbSchema>;
