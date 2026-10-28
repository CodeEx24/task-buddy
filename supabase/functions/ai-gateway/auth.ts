// JWT verification (TB-22). The function runs with `verify_jwt = false` (config.toml) so that this
// check is the single, tested enforcement point: it works with Supabase's asymmetric signing keys
// and rejects the anon/publishable key, which is a valid JWT for the platform check but not a user.

export type AuthUser = { id: string };

export type AuthVerifier = {
  /** Resolves the signed-in user for a bearer token, or null when the token is not a live session. */
  verify(token: string): Promise<AuthUser | null>;
};

const BEARER = /^Bearer\s+(\S+)$/i;

/** The bearer token, or null when the header is missing or malformed. */
export function bearerToken(header: string | null): string | null {
  const match = header?.trim().match(BEARER);
  return match?.[1] ?? null;
}

export type SupabaseAuthVerifierOptions = {
  supabaseUrl: string;
  /** The project's anon/publishable key (auto-injected as SUPABASE_ANON_KEY). Not a secret. */
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Asks Supabase Auth (`GET /auth/v1/user`, what `supabase.auth.getUser(jwt)` does) who owns the
 * token. Unlike a local signature check this also rejects signed-out sessions and deleted users.
 */
export function createSupabaseAuthVerifier(options: SupabaseAuthVerifierOptions): AuthVerifier {
  const url = `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async verify(token) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(url, {
          headers: { Authorization: `Bearer ${token}`, apikey: options.apiKey },
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return null;
        }
        const body: unknown = await response.json();
        const id =
          typeof body === 'object' && body !== null ? (body as { id?: unknown }).id : undefined;
        return typeof id === 'string' && id.length > 0 ? { id } : null;
      } catch {
        // Auth unreachable or slow: fail closed.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
