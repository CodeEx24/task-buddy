import { ZodError } from 'zod';

import { describeDbError } from '@/db/db-errors';

export type RepoErrorCode = 'NOT_FOUND' | 'DUPLICATE' | 'DB_FAILURE';

/**
 * Expected repository failure. Messages name the entity only, never user content
 * (titles, notes, tag names), so they are safe to log.
 */
export class RepoError extends Error {
  readonly code: RepoErrorCode;
  /** For DB_FAILURE: driver error class and SQLite code only. */
  readonly dbError?: { name: string; code?: string };

  constructor(code: RepoErrorCode, message: string, dbError?: { name: string; code?: string }) {
    super(message);
    if (dbError) this.dbError = dbError;
    this.name = 'RepoError';
    this.code = code;
  }
}

export const notFound = (entity: string) => new RepoError('NOT_FOUND', `${entity} not found`);

/** Drops keys whose value is `undefined`, so a patch never claims to change a field it skips. */
export function definedOnly<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * Wraps a repository function so driver failures never leave it raw. Drizzle's DrizzleQueryError
 * message embeds the bound params (task titles, notes, tag names), which must not reach logs or
 * crash reports. RepoError and ZodError (no input values in messages) pass through unchanged.
 */
export function guardDb<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A) => {
    try {
      return fn(...args);
    } catch (error) {
      if (error instanceof RepoError || error instanceof ZodError) throw error;
      throw new RepoError('DB_FAILURE', 'Local database operation failed', describeDbError(error));
    }
  };
}
