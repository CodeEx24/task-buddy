# TB-32 — Implementation plan

> Jira: https://stratyge.atlassian.net/browse/TB-32 · Spec: [spec.md](spec.md)
> Bar: an engineer who has never seen the conversation could implement the change from this plan alone.

## Branch & worktree
`feat/tb-32/settings-shell` (Orca worktree `tb-32-settings-shell`, from `origin/main` @ `1a00ccf`) · Owns: `src/features/settings/**`, `src/app/(tabs)/settings/**`, `docs/tickets/TB-32/**`, `drizzle/0002_*` · Shared files (small, additive edits): `src/db/schema.ts`, `src/db/introspect.ts`, `src/db/schema.test.ts`, `src/db/db-benchmark-route.test.tsx`, `drizzle/meta/_journal.json`, `drizzle/migrations.js`, `src/app/_layout.tsx`, `src/db/DbGate.tsx`, `src/db/use-db-migrations.ts`, `src/db/DbGate.test.tsx` · Removes: `src/app/(tabs)/settings.tsx`, `src/features/navigation/components/SettingsScreen.tsx` · Must not edit: `eslint.config.js`, `.github/workflows/*`, lint/format configs, `src/theme/*`.

## Dependencies
Blocked by US-004 (TB-18 app shell, merged on `main`). Uses TB-17 primitives and TB-21 local DB (merged). TB-20 (PR #18, open) supplies the session and sign-out button; this ticket leaves a slot for them.

## Tasks
### Task 1 — Preferences table and migration
- [x] `src/db/schema.ts`: `preferences` table (sync columns, `key`, `value`), partial unique index `preferences_key_live_unique`; `PreferenceRow` type.
- [x] `src/db/introspect.ts`: add `preferences` to `APP_TABLES` (schema test checks its sync columns).
- [x] `pnpm db:generate --name preferences` → `drizzle/0002_preferences.sql`, snapshot, journal, `migrations.js`.
- [x] Update the dev benchmark route test (table list, "Migrations applied: 3").
- Verify: `src/db/schema.test.ts`, `src/db/migrations.test.ts` (step 2 → no rows lost), `pnpm exec drizzle-kit check`.

### Task 2 — Preference definitions and repository
- [x] `preferences/define-preference.ts`, `preferences/appearance.ts`, `preferences/index.ts` (registry).
- [x] `repo/preference-repo.ts`: read (default fallback), write (validate, upsert in a transaction), reset (soft delete), wrapped in `guardDb`.
- Verify: `define-preference.test.ts`, `preference-repo.test.ts`.

### Task 3 — Hook, registries, screens and routes
- [x] `hooks/use-preference.ts` (synchronous cache write, rollback on error), `hooks/use-account-email.ts`.
- [x] `registry/types.ts`, `registry/pages.ts`, `registry/sections.ts`.
- [x] Components: `SettingsScreen`, `SettingsPageRow`, `AccountEmailRow`, `SettingsPageScreen`, `SettingsStack`, `AppearanceSettings`, `AppearanceSync`.
- [x] Routes `src/app/(tabs)/settings/{_layout,index,[page]}.tsx`; delete the old route and placeholder screen; mount `AppearanceSync` in `src/app/_layout.tsx`.
- Verify: `SettingsScreen.test.tsx`, `AppearanceSettings.test.tsx`, `settings-routes.test.tsx`, existing `app-shell-routes.test.tsx`.

### Task 3b — PR #19 review fixes
- [x] `DbGate`/`useDbMigrations` `onReady(db)`; `src/features/settings/apply-stored-appearance.ts`; wired in `src/app/_layout.tsx`.
- [x] `usePreference`: re-read on error, latest-tap guard.
- [x] Page rows hold the page object; `registry/pages.test.ts`.
- [x] Route test and device step for re-pressing the Settings tab.
- Verify: `apply-stored-appearance.test.tsx`, `DbGate.test.tsx`, `use-preference.test.tsx`, `pages.test.ts`, `settings-routes.test.tsx`.

### Task 4 — Docs and gates
- [x] `docs/tickets/TB-32/{intent,spec,plan,verification}.md`.
- [x] Gates: install, lint, typecheck, test, drizzle check, workflow check.

## Test strategy
| AC | Test (layer) | File |
|---|---|---|
| AC1 | Account section + email row; preference rows listed and push `/settings/<slug>` (component) | `src/features/settings/components/SettingsScreen.test.tsx` |
| AC1 | Real routes: Settings tab → Appearance page in the tab stack → Back; unknown page (integration) | `src/features/settings/settings-routes.test.tsx` |
| AC2 | Apply at once (`Appearance.setColorScheme`), stored in SQLite, restored on cold start, rollback on failure (component + DB) | `src/features/settings/components/AppearanceSettings.test.tsx` |
| AC2 | Read/write/reset, validation, corrupt values, unique live key, restart with a DB file (repo) | `src/features/settings/repo/preference-repo.test.ts` |
| AC2 | Decode/encode safe defaults, registry unique keys (unit) | `src/features/settings/preferences/define-preference.test.ts` |
| AC3 | Screen renders an injected registry (new section, custom row, page row) without code changes (component) | `SettingsScreen.test.tsx` "renders sections and rows straight from the registry" |
| AC4 | Full suite, migration harness | `pnpm test --ci`, `src/db/migrations.test.ts` |

E2E (Maestro) is not set up yet; device steps are in verification.md.

## Risks & rollback
- **`Appearance.setColorScheme` on device:** on Android it uses `AppCompatDelegate.setDefaultNightMode`; if the activity were recreated the app would reload. Expo's template declares `uiMode` in `configChanges`, so it should not. Detect in the device check (step 3); rollback = remove `<AppearanceSync />` (theme follows the system again, stored value harmless).
- **Migration:** additive table only; harness proves no data loss. Rollback before release: revert the commit; after release: fix forward.
- **TB-20 merge:** modify/delete conflict on `features/navigation/components/SettingsScreen.tsx` and an edit to `_layout.tsx`; resolution documented in verification.md.
