// Who is asking to be deleted (TB-53). Like the ai-gateway (TB-22 auth.ts), the function runs with
// `verify_jwt = false` and asks Supabase Auth (`GET /auth/v1/user`) who owns the bearer token, so
// the anon/publishable and service-role keys (valid JWTs, not users) are rejected.
//
// One difference: a validly signed session whose user no longer exists is reported as `deleted`
// instead of being refused. Auth checks the token's signature before it looks the user up, and
// answers `user_not_found` only for a correctly signed token. That makes a retry after a lost
// reply idempotent: the app learns the account is already gone and finishes signing out.

export type AccountIdentity =
  | { kind: 'user'; id: string }
  /** A correctly signed session of an account that has already been deleted. */
  | { kind: 'deleted' }
  /** Missing, malformed, expired, signed-out or non-user token, or Auth unreachable. */
  | { kind: 'invalid' };

export type AccountIdentifier = {
  identify(token: string): Promise<AccountIdentity>;
};

export type SupabaseAccountIdentifierOptions = {
  supabaseUrl: string;
  /** The project's anon/publishable key (auto-injected as SUPABASE_ANON_KEY). Not a secret. */
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const INVALID: AccountIdentity = Object.freeze({ kind: 'invalid' });

function readField(body: unknown, field: string): unknown {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)[field]
    : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createSupabaseAccountIdentifier(
  options: SupabaseAccountIdentifierOptions,
): AccountIdentifier {
  const url = `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async identify(token) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(url, {
          headers: { Authorization: `Bearer ${token}`, apikey: options.apiKey },
          signal: controller.signal,
        });
        const body = await readJson(response);
        if (response.ok) {
          const id = readField(body, 'id');
          return typeof id === 'string' && id.length > 0 ? { kind: 'user', id } : INVALID;
        }
        // GoTrue: 403 + error_code user_not_found = "User from sub claim in JWT does not exist".
        if (response.status === 403 && readField(body, 'error_code') === 'user_not_found') {
          return { kind: 'deleted' };
        }
        return INVALID;
      } catch {
        // Auth unreachable or slow: fail closed (the app shows a retryable error).
        return INVALID;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
