# TB-32 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-32 · PR: (coordinator opens) · Branch: `feat/tb-32/settings-shell`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-32-settings-shell` (base `origin/main` 1a00ccf). No Metro, emulator or EAS build was started (worker brief).

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Lockfile unchanged (no new dependencies) |
| `pnpm rebuild better-sqlite3` | pass | For the DB tests (same note as TB-26/TB-28) |
| `pnpm test --ci` (baseline on 1a00ccf, before any change) | pass | 44 suites, 299 tests |
| `pnpm lint` | pass | 0 problems (after `prettier --write` on 3 wrapped lines, see failures) |
| `pnpm typecheck` | pass | `tsc --noEmit`; stale git-ignored `.expo/types/router.d.ts` deleted first (routes changed) |
| `pnpm test --ci` | pass | 49 suites, 332 tests (+5 suites, +33 tests vs baseline); migration harness now also checks step 2 (`0002_preferences`) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine" |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-32/settings-shell` | pass | `workflow check: ok` |

Failures hit during the build, and their fixes:
1. `src/db/db-benchmark-route.test.tsx` hard-codes the table list and migration count → updated to include `preferences` and "Migrations applied: 3".
2. Prettier (3 lines too long) → `pnpm exec prettier --write`.
3. The route test asserted the checked chip synchronously after a press inside the navigator → `waitFor` there; the synchronous apply is asserted in `AppearanceSettings.test.tsx`. `usePreference` was changed to write the cache synchronously before `mutate` (spec D7).

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given the Settings tab, then I can see my account email, sign out, and open preference sections | partial — Jest met; device pending coordinator. Email shows "Not signed in" and there is no sign-out button until TB-20 (PR #18) merges into the Account section | `SettingsScreen.test.tsx` "shows the Account section with the account email (AC1)", "lists every registered preference page and opens it on tap (AC1)"; `settings-routes.test.tsx` "Settings tab → Appearance page (tab bar stays) → Dark applies and persists → back", "shows a message for an unknown settings page". Device: steps 1–2, 5 |
| Preference changes persist locally and apply immediately | partial — Jest met; device pending coordinator | `AppearanceSettings.test.tsx` "applies a choice at once and stores it locally" (chip checked and `Appearance.setColorScheme('dark')` right after the press; SQLite row), "restores the stored choice on a cold start (new query cache)", "rolls back and says so when the write fails", "starts on System…"; `preference-repo.test.ts` (10 tests: default, write/read, update in place, JSON objects, ZodError on invalid, corrupt → default and repair, reset soft delete, unique live key, RepoError without value, persists across closing and reopening a DB file); `define-preference.test.ts` (12 tests). Device: steps 3–4 |
| Settings sections are driven by a registry so later stories add rows without editing the screen | met | `SettingsScreen.test.tsx` "renders sections and rows straight from the registry, in order (AC3)": an injected extra section with a custom row and a page row renders in order and navigates, with no screen change. Registries: `src/features/settings/registry/sections.ts`, `registry/pages.ts`, `preferences/index.ts`; how TB-33 plugs in: spec "How a later story plugs in" |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | partial — tests, lint, typecheck, drizzle and workflow checks green; docs written; PR review, CI and device proof: coordinator | Commands table above; `docs/tickets/TB-32/*` |

## Manual / E2E
For the coordinator. Needs **no new dev build** (no new dependency, no native code; `Appearance` is React Native core). Existing development build + Metro on this branch. Android emulator, `adb reverse tcp:8081 tcp:8081`, `pnpm start`. The DB migrates to version 3 on first launch (new `preferences` table); existing tasks must still be there.

1. **Settings list (AC1).** Tap the Settings tab (`tab-settings`). Expect (`settings-screen`): title "Settings"; section **Account** (`settings-section-account`) with "Email" / "Not signed in" (`settings-account-email-value`); section **Preferences** (`settings-section-preferences`) with a row "Appearance — Light, dark or match your device" and a chevron (`settings-row-appearance`).
2. **Open a section (AC1).** Tap `settings-row-appearance` → page `settings-page-appearance` slides in with a native header "Appearance" and Back; the tab bar stays visible with Settings selected. Android Back (or the header Back) → Settings list.
3. **Apply immediately (AC2).** On Appearance, tap **Dark** (`appearance-theme-dark`) → the chip is selected and the whole app turns dark in the same moment (page, header, tab bar); switch tabs → Today/Inbox are dark too. The app must **not** restart/reload (watch Metro: no new bundle load). Tap **Light** (`appearance-theme-light`) → light even if the device is in dark mode (`adb shell cmd uimode night yes`). Tap **System** (`appearance-theme-system`) → follows the device again (toggle `cmd uimode night yes/no` and watch it follow).
4. **Persist (AC2).** Choose **Dark**, then `adb shell am force-stop <package>` and relaunch → the app opens dark; Settings → Appearance shows Dark selected. Set back to System.
5. **Unknown page.** `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://settings/nope"` → "This settings page doesn't exist." with Back.
6. **Regression.** Today/Inbox tasks still listed after the migration; task modal (`taskbuddy://task/<id>`) still opens. TalkBack on the Settings list: "Appearance, button" with the description as hint; theme chips read as radio buttons with checked state.

## TB-20 merge (sign-out row)
Expect a small conflict when TB-20 (PR #18) and this branch meet:
- `src/features/navigation/components/SettingsScreen.tsx`: deleted here, edited by TB-20 → keep it deleted. Instead, in `src/features/settings/registry/sections.ts` add to the Account section's `rows`, after `account-email`: `{ kind: 'custom', id: 'sign-out', Component: SignOutButton }` (import from `@/features/auth/components/SignOutButton`). The `PlaceholderScreen` `children` prop TB-20 adds is then unused by Settings (harmless).
- `src/features/settings/hooks/use-account-email.ts`: return `useSession().session?.user.email ?? null` (`@/features/auth/session/SessionProvider`).
- `src/app/_layout.tsx`: keep both TB-20's providers/guard and `<AppearanceSync />` (it must stay inside `QueryProvider`).
After that, AC1's email and sign-out parts can be verified on device with a signed-in account.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | First commit split left the old Settings route deleted without its replacement (broken intermediate commit) | self | Commits rebuilt before handoff: 7b9d5ce (data layer) then 95dae9b (screen + routes) |
| 2 | Minor | `usePreference` optimistic update ran in async `onMutate`, so the new value appeared a tick after the tap | self | Synchronous `setQueryData` in `setValue`, rollback in `onError` (spec D7) |
| 3 | Minor | `value: query.data ?? default` would hide a legitimately `null` preference value | self | Uses `=== undefined` check |

## Known limitations & follow-ups
- Account email and sign-out arrive with TB-20 (see "TB-20 merge").
- `guardDb`/`RepoError` and the task test helpers are imported from `features/tasks`; hoist them to `src/lib` (and a shared testing folder) in a small refactor ticket.
- Which preferences sync (and whether theme is per device) is for TB-43.
- E2E (Maestro) flow for Settings once `.maestro/` exists.

## Completion
- [ ] All AC met with evidence (device and TB-20 parts pending)
- [x] Gates green locally (CI: coordinator)
- [x] No open Blocking findings
- [ ] Jira updated (coordinator)
