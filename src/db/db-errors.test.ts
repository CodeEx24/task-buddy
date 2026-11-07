import { describeDbError } from './db-errors';

describe('describeDbError', () => {
  it('keeps the error class and SQLite code, never the message', () => {
    const error = Object.assign(new Error('Failed query: insert ... params: secret title'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    expect(describeDbError(error)).toEqual({ name: 'Error', code: 'SQLITE_CONSTRAINT_UNIQUE' });
  });

  it('reads the code from a wrapped driver error', () => {
    const error = new Error('Failed query: secret', { cause: { code: 'SQLITE_BUSY' } });
    expect(describeDbError(error)).toEqual({ name: 'Error', code: 'SQLITE_BUSY' });
  });

  it('parses the expo-sqlite "Error code N" form', () => {
    const error = new Error("Calling the 'execSync' function has failed → Error code 5: locked");
    expect(describeDbError(error)).toEqual({ name: 'Error', code: 'SQLITE_5' });
  });

  it('reads the code from an error made in another realm (not instanceof Error)', () => {
    const foreign = {
      name: 'SqliteError',
      message: 'secret title',
      code: 'SQLITE_CONSTRAINT_TRIGGER',
    };
    expect(foreign instanceof Error).toBe(false);
    expect(describeDbError(foreign)).toEqual({
      name: 'SqliteError',
      code: 'SQLITE_CONSTRAINT_TRIGGER',
    });
  });

  it('handles non-Error throws', () => {
    expect(describeDbError('boom')).toEqual({ name: 'string' });
  });
});
