# TB-53 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-53 · Spec: [spec.md](spec.md)

## Branch & worktree
`feat/tb-53/data-export-account-deletion` (Orca worktree `tb-53-export-delete`, from `main` @ `46a3164`).
Owns: `src/features/account/**`, `supabase/functions/delete-account/**`, `packages/schemas/src/delete-account.ts`, `supabase/tests/database/account_deletion.test.sql`, `scripts/account/**`, `docs/tickets/TB-53/**`, `docs/actions/account-deletion-deploy.md`.
Shared files touched (minimal, additive): `package.json` + `pnpm-lock.yaml` (via `expo install` only), `app.json` (plugin added by `expo install`), `supabase/config.toml` (one function block), `src/db/client.ts`, `src/db/node-client.ts`, `src/db/user-db.ts` (+ test), `src/db/use-db-migrations.ts`, new `src/db/pending-wipe.ts` (+ test), `src/features/settings/registry/sections.ts` (two rows), `docs/actions/README.md`, `packages/schemas/README.md`, `supabase/functions/README.md`.
Must not edit: `.github/workflows/*`, `legal-site/*` (owner action), migrations of other tickets.

## Dependencies
Blocked by TB-43 and TB-20, both **Done** in Jira (checked 2026-10-28). Blocks TB-64 (store submission).

## Tasks
### Task 1 — Contract + Edge Function
- [x] `packages/schemas/src/delete-account.ts` (request/success/error schemas).
- [x] `supabase/functions/delete-account/{account-auth,auth-admin,handler,index}.ts`, `deno.json`; `config.toml` block.
- Verify: `pnpm test --selectProjects edge-functions supabase/functions/delete-account` (handler + clients tests).

### Task 2 — Database guard
- [x] `supabase/tests/database/account_deletion.test.sql`: every FK to `auth.users` cascades; every `user_id` table has one; delete a seeded user → 0 rows left, the other user keeps 10.
- Verify: `supabase test db` against the local stack.

### Task 3 — Local DB wipe
- [x] `wipeUserDb` / `retireDb` (user-db.ts), `deleteUserDb` in both DB clients; `pending-wipe.ts`; `useDbMigrations` runs owed wipes when signed out and before opening a DB.
- Verify: `src/db/user-db.test.ts` (legacy owned → emptied + retired; another account's own file still reachable; idempotent; every step attempted), `src/db/pending-wipe.test.ts` (retry after failure, after restart, storage failure, concurrency).

### Task 4 — Export
- [x] Schema, repo snapshot, pure builder, file + share module, `ExportDataButton`.
- Verify: `src/features/account/export/data-export.test.ts` (shape from a seeded DB; deleted rows excluded; share called with a file URI; unavailable/failure paths; cleanup).

### Task 5 — Delete flow + UI
- [x] Remote (error classification), `deleteAccount` orchestration, `DeleteAccountButton`, settings registry rows.
- Verify: `src/features/account/api/delete-account.test.ts`, `src/features/account/account-routes.test.tsx` (3-tap delete → signed out + wiped; cancel; offline; export via route).

### Task 6 — Real local integration
- [x] Own edge-runtime container on the stack network; `scripts/account/local-delete-check.sh`; transcript in [local-integration.md](local-integration.md).

### Task 7 — Docs, owner action, gates, PR
- [x] verification.md, `docs/actions/account-deletion-deploy.md` + README to-do.
- [x] lint, typecheck, full Jest (`--maxWorkers=1`), `drizzle-kit check`, `supabase test db`, docs gate.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Unit (builder, repo, file+share) | `src/features/account/export/data-export.test.ts` |
| AC1 | Route (Settings → Export → share sheet with file URI) | `src/features/account/account-routes.test.tsx` |
| AC2 | Edge function unit (authz, idempotency, errors, logs) | `supabase/functions/delete-account/handler.test.ts`, `clients.test.ts` |
| AC2 | SQL (cascade guard, nothing left, other user intact) | `supabase/tests/database/account_deletion.test.sql` |
| AC2 | Real local stack (Auth + Postgres) | `scripts/account/local-delete-check.sh` → `local-integration.md` |
| AC2 | Orchestration order, offline/session/failed | `src/features/account/api/delete-account.test.ts` |
| AC2/AC3 | Route: 3 taps, signed out, local wipe, cancel, offline | `src/features/account/account-routes.test.tsx` |
| AC2 | Local DB wipe, other account untouched | `src/db/user-db.test.ts` |

## Risks & rollback
- **Irreversible by design** (deleting an account). Mitigations: confirmation dialog, explicit body word, authz from Auth only, idempotent retries, extensive tests on throwaway users only.
- **Hosted deploy order:** the app build calling `delete-account` needs the function deployed (owner action). Before that, the call returns 404 → the app shows "Something went wrong and nothing was deleted".
- **New native modules** → new EAS dev build. The export module is loaded lazily, so an old dev client still starts; only Export fails there.
- **Rollback:** revert the PR (no migration to undo); `supabase functions delete delete-account` on hosted projects if it was deployed.
