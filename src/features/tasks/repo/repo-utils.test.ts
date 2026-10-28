import { DrizzleQueryError } from 'drizzle-orm/errors';
import { z, ZodError } from 'zod';

import { guardDb, RepoError } from './repo-utils';

describe('guardDb', () => {
  it('replaces a DrizzleQueryError (message embeds bound params) with a redacted DB_FAILURE', () => {
    const driverError = Object.assign(new Error('UNIQUE constraint failed'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    const fn = guardDb(() => {
      throw new DrizzleQueryError('insert into tasks ...', ['secret title'], driverError);
    });
    let caught: unknown;
    try {
      fn();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RepoError);
    // DrizzleQueryError keeps name "Error"; the SQLite code comes from its driver cause.
    expect((caught as RepoError).code).toBe('DB_FAILURE');
    expect((caught as RepoError).message).toBe('Local database operation failed');
    expect((caught as RepoError).dbError).toEqual({
      name: 'Error',
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    expect(JSON.stringify(caught)).not.toContain('secret');
  });

  it('passes RepoError and ZodError through, and returns values unchanged', () => {
    const notFound = new RepoError('NOT_FOUND', 'Task not found');
    expect(() =>
      guardDb(() => {
        throw notFound;
      })(),
    ).toThrow(notFound);
    expect(() => guardDb(() => z.string().parse(1))()).toThrow(ZodError);
    expect(guardDb((a: number, b: number = 2) => a + b)(1)).toBe(3);
  });
});
