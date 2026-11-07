// Deletes an Auth user with the service role (TB-53): `DELETE /auth/v1/admin/users/<id>`, a hard
// delete (`should_soft_delete: false`). Postgres then removes everything the user owns in the same
// transaction: every public table that references auth.users does so with ON DELETE CASCADE
// (profiles, lists, tasks, subtasks, ai_usage_ledger, ai_usage_counters), which the pgTAP test
// supabase/tests/database/account_deletion.test.sql enforces for every current and future table.
// Auth also drops the user's sessions, refresh tokens and identities.

export type AdminDeleteResult = 'deleted' | 'not_found';

export type AuthAdmin = {
  /** Throws AuthAdminError on any failure other than "no such user". */
  deleteUser(userId: string): Promise<AdminDeleteResult>;
};

/** Carries the HTTP status only; never the response body. */
export class AuthAdminError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthAdminError';
    this.status = status;
  }
}

export type SupabaseAuthAdminOptions = {
  supabaseUrl: string;
  /** Service-role key (server-only secret, auto-injected as SUPABASE_SERVICE_ROLE_KEY). Never logged. */
  serviceRoleKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSupabaseAuthAdmin(options: SupabaseAuthAdminOptions): AuthAdmin {
  const base = `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/users/`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async deleteUser(userId) {
      // The id comes from Auth itself, but it becomes part of a URL path: accept a UUID only.
      if (!UUID.test(userId)) throw new AuthAdminError('invalid user id');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(base + userId, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${options.serviceRoleKey}`,
            apikey: options.serviceRoleKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ should_soft_delete: false }),
          signal: controller.signal,
        });
        await response.body?.cancel();
        if (response.ok) return 'deleted';
        // Another request (a retry racing this one) deleted it first: same end state.
        if (response.status === 404) return 'not_found';
        throw new AuthAdminError('admin delete failed', response.status);
      } catch (error) {
        if (error instanceof AuthAdminError) throw error;
        throw new AuthAdminError(
          controller.signal.aborted ? 'admin delete timed out' : 'admin delete unreachable',
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
