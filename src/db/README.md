# src/db

Local SQLite (TB-21): Drizzle schema, the expo-sqlite client, migrations and the Node test twin.
Data access from features goes through repositories (`src/features/*/repo`); only this folder may
import `expo-sqlite` or a Drizzle driver.

| File | Purpose |
|---|---|
| `schema.ts` | Tables. Every table has `id` (UUIDv7), `created_at`, `updated_at`, `deleted_at` (epoch ms) |
| `types.ts` | `TaskBuddyDb`: the driver-agnostic handle repositories take |
| `client.ts` | App DB (`taskbuddy.db`, WAL, foreign keys on) and `migrateDb` with the bundled `drizzle/migrations.js` |
| `node-client.ts` | better-sqlite3 twin with the same exports; Jest maps `@/db/client` to it |
| `use-db-migrations.ts`, `DbGate.tsx` | Run pending migrations before the app renders; retryable error screen |
| `migration-safety.ts` | Generic "no rows lost" harness used by `migrations.test.ts` for every migration |
| `db-errors.ts` | Logs DB errors as class + SQLite code only (no task data) |

Changing the schema: edit `schema.ts`, run `pnpm db:generate`, commit the new `drizzle/` files.
After a release, never edit a shipped migration; fix forward with a new one.
