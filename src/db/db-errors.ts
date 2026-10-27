/**
 * Privacy-safe description of a DB error: the error class and SQLite result code only.
 * Messages are dropped because a failed query's message can embed bound values (task text).
 */
export function describeDbError(error: unknown): { name: string; code?: string } {
  if (!(error instanceof Error)) return { name: typeof error };
  const withCode = error as Error & { code?: unknown; cause?: unknown };
  // Drizzle wraps driver errors (DrizzleQueryError) and keeps the driver error as `cause`.
  const cause = withCode.cause as { code?: unknown } | undefined;
  const rawCode = withCode.code ?? cause?.code;
  const fromCode = typeof rawCode === 'string' ? rawCode : undefined;
  // expo-sqlite: "... Error code 5: database is locked"; better-sqlite3: code "SQLITE_BUSY".
  const fromMessage = /Error code (\d+)/.exec(error.message)?.[1];
  const code = fromCode ?? (fromMessage ? `SQLITE_${fromMessage}` : undefined);
  return code ? { name: error.name, code } : { name: error.name };
}

/** Logs a DB failure without task data. `context` must be a fixed string, never user input. */
export function logDbError(context: string, error: unknown): void {
  console.error(`[db] ${context} failed`, describeDbError(error));
}
