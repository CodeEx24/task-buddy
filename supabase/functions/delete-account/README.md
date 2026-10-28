# delete-account

In-app account deletion ([TB-53](https://stratyge.atlassian.net/browse/TB-53)). Server-only: never import anything from here into `src/`.

## Endpoint

`POST <SUPABASE_URL>/functions/v1/delete-account` with `Authorization: Bearer <user access token>` and body `{ "confirm": "DELETE" }` (`deleteAccountRequestSchema` in `packages/schemas/src/delete-account.ts`, strict: no other keys).

| Case | Status | Body |
|---|---|---|
| Live user | 200 | `{ requestId, status: "deleted" }` |
| Validly signed token of an account that no longer exists (retry after a lost reply), or a concurrent delete won | 200 | `{ requestId, status: "already_deleted" }` |
| No / malformed token, anon or service-role key, signed-out or expired session, Auth unreachable | 401 | `UNAUTHENTICATED` |
| Body not exactly `{ "confirm": "DELETE" }` (checked after the header, before Auth) | 400 | `BAD_REQUEST` |
| Not POST | 405 | `METHOD_NOT_ALLOWED` |
| Admin delete failed | 500 | `INTERNAL` (nothing deleted; retry is safe) |

## How it deletes

1. `account-auth.ts` asks Supabase Auth `GET /auth/v1/user` who owns the token (like `ai-gateway/auth.ts`, so non-user JWTs are refused). The user id comes only from Auth, never from the request.
2. `auth-admin.ts` calls `DELETE /auth/v1/admin/users/<id>` with `should_soft_delete: false` and the service-role key: a hard delete.
3. Postgres removes everything the user owns in the same transaction: every public table that references `auth.users` does so `ON DELETE CASCADE` (`profiles`, `lists`, `tasks`, `subtasks`, `ai_usage_ledger`, `ai_usage_counters`). `supabase/tests/database/account_deletion.test.sql` fails CI if a future table breaks that rule. Auth drops the user's identities, sessions and refresh tokens.

Not removed here: Auth's own audit log entries (they expire with Supabase's log retention) and backups (see the privacy policy).

## Config

`verify_jwt = false` in `supabase/config.toml` (the function checks the token itself). No secrets of its own: `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Deploy: [docs/actions/account-deletion-deploy.md](../../../docs/actions/account-deletion-deploy.md).

Logging: one JSON line per request with `requestId`, `status`, `outcome`, `durationMs` and, on admin failures, `adminStatus`. Never the token, user id, email or a body.

Tests: `pnpm test --selectProjects edge-functions supabase/functions/delete-account`; real local run: `scripts/account/local-delete-check.sh` (see `docs/tickets/TB-53/local-integration.md`).
