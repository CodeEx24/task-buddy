export type RepoErrorCode = 'NOT_FOUND' | 'DUPLICATE';

/**
 * Expected repository failure. Messages name the entity only, never user content
 * (titles, notes, tag names), so they are safe to log.
 */
export class RepoError extends Error {
  readonly code: RepoErrorCode;

  constructor(code: RepoErrorCode, message: string) {
    super(message);
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
