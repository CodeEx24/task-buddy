# TB-32 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-32 · PR: https://github.com/CodeEx24/task-buddy/pull/19 · Branch: `feat/tb-32/settings-shell`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Windows 11, pnpm 10.17.1, 2026-10-28, Orca worktree `tb-32-settings-shell`, round 2: after merging `origin/main` three times (TB-20 sign-in at 522445f, TB-22 AI gateway at 01fccc8, TB-54 legal links at 8d9cd11), adding the Account sign-out row and the Legal section. No Metro, emulator or EAS build was started (worker brief).

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | pass | Picks up TB-20's `expo-secure-store` and supabase-js patch from main; no new dependency from TB-32 |
| `pnpm rebuild better-sqlite3` | pass | For the DB tests |
| `pnpm lint` | pass | 0 problems |
| `pnpm typecheck` | pass | `tsc --noEmit` |
| `pnpm test --ci --maxWorkers=2` | pass | 69 suites, 519 tests on the tree merged with 8d9cd11 (main's TB-20/TB-22/TB-54 tests included, among them TB-54's `settings-legal-links-route.test.tsx` against this shell) |
| `pnpm exec drizzle-kit check` | pass | "Everything's fine". Main gained no local SQLite migration after 0001, so `0002_preferences` was kept as generated (not renumbered, not regenerated) |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-32/settings-shell --pr` | pass | `workflow check: ok` |

Round 2 notes:
1. Merge conflicts: `src/app/_layout.tsx` (kept TB-20's `SessionProvider` + `RootNavigator` guard, added `DbGate onReady={applyStoredAppearance}` and `<AppearanceSync />` inside `QueryProvider`); `src/features/navigation/components/SettingsScreen.tsx` (TB-20 edited the placeholder, TB-32 deleted it; kept deleted, so the registry shell is the only Settings screen).
2. Sign-out is reused, not duplicated: TB-20's `SignOutButton` (`src/features/auth/components/`, already shared, with its confirm dialog) is a `custom` row in the Account section of `registry/sections.ts`.
3. A first version of the new launch test rendered the app twice in one test and leaked router state into the next test; it now seeds the stored preference through the repo and launches once.
4. CI (run 40731589116, `ci` job) failed on `use-preference.test.tsx` "a failed earlier write never overwrites a later one that succeeded"; it also failed locally in about 4 of 6 solo runs. Cause, found with temporary logging (removed): no query re-read and no `onError` had run. `result.current` simply hadn't re-rendered yet, because TanStack Query notifies observers in a 0 ms `notifyManager` batch that `act`/`fireEvent` don't wait for. The hook was fine; the test assertion was racy. Fix: `waitFor` around the post-tap value checks in `use-preference.test.tsx` and `AppearanceSettings.test.tsx`. The "applies before it is stored" proof stays, because the first write is held pending while Dark is shown. After the fix: 8/8 stress runs of both files green, and the full suite is green.
5. Round 1 (before the merges) also had lint/typecheck/test/drizzle green; see git history of this file for its failure log.

## Acceptance criteria
Status is from Jest (unit + real-route tests through `src/app/`, root layout, DB gate, session guard). The emulator proof of each row is done by the coordinator (steps in "Manual / E2E").

| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given the Settings tab, then I can see my account email, sign out, and open preference sections | met | `settings-routes.test.tsx` "Account shows the signed-in email; Sign out asks first, then shows sign-in (AC1)" (real `/settings` route: email from `useSession()`, Sign out → confirm dialog; Cancel keeps Settings; confirm calls `signOut({ scope: 'local' })` and shows `sign-in-screen`), "Settings tab → Appearance page (tab bar stays) → Dark applies and persists → back"; `SettingsScreen.test.tsx` "shows the Account section with the account email and Sign out (AC1)", "shows a placeholder instead of an email when there is no session", "lists every registered preference page and opens it on tap (AC1)"; TB-20's `sign-in-routes.test.tsx` "sign-out from Settings asks first, then shows sign-in" also passes against the new shell. Device: coordinator, steps 1–2, 2b, 5 |
| Preference changes persist locally and apply immediately | met | `settings-routes.test.tsx` "Settings tab → Appearance page … Dark applies and persists" (`Appearance.setColorScheme('dark')` + SQLite row), "a stored Appearance preference is applied when the app launches" (stored Light → `setColorScheme('light')` and Light checked on the real route); `apply-stored-appearance.test.tsx` "applies the stored Dark override before the first screen renders"; `DbGate.test.tsx` onReady before first render; `use-preference.test.tsx` (write-race rollback); `AppearanceSettings.test.tsx` (apply at once, cold start restore, rollback on failed write, System default); `preference-repo.test.ts` (10 tests incl. persists across closing and reopening a DB file); `define-preference.test.ts` (12 tests). Device (no theme flash on relaunch): coordinator, steps 3–4 |
| Settings sections are driven by a registry so later stories add rows without editing the screen | met | `SettingsScreen.test.tsx` "renders sections and rows straight from the registry, in order (AC3)"; `registry/pages.test.ts`. Proven in practice: TB-20's sign-out was added by editing only `registry/sections.ts`, not the screen |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | Commands table above (65 suites / 495 tests, lint, typecheck, drizzle, workflow check); PR #19 review round 1 findings resolved (table below); CI on PR #19 (ci, supabase, bundle) green on the pushed head; `docs/tickets/TB-32/*` updated. Merge and device proof: coordinator |

## Manual / E2E
For the coordinator. Needs **no new dev build** (no new dependency, no native code; `Appearance` is React Native core). Existing development build + Metro on this branch. Android emulator, `adb reverse tcp:8081 tcp:8081`, `pnpm start`. The DB migrates to version 3 on first launch (new `preferences` table); existing tasks must still be there.

1. **Settings list (AC1).** Tap the Settings tab (`tab-settings`). Expect (`settings-screen`): title "Settings"; section **Account** (`settings-section-account`) signed in, with "Email" / your account email (`settings-account-email-value`) and a **Sign out** button (`sign-out`); section **Preferences** (`settings-section-preferences`) with a row "Appearance — Light, dark or match your device" and a chevron (`settings-row-appearance`); section **Legal** (`settings-section-legal`).
2. **Open a section (AC1).** Tap `settings-row-appearance` → page `settings-page-appearance` slides in with a native header "Appearance" and Back; the tab bar stays visible with Settings selected. Android Back (or the header Back) → Settings list.
2b. **Tab re-press pops to the list.** On `/settings/appearance` (step 2), tap the Settings tab (`tab-settings`) again → the stack pops back to the Settings list (`settings-screen`); tapping it once more does nothing. Jest: `settings-routes.test.tsx` "tapping the Settings tab on a preference page pops back to the list".
3. **Apply immediately (AC2).** On Appearance, tap **Dark** (`appearance-theme-dark`) → the chip is selected and the whole app turns dark in the same moment (page, header, tab bar); switch tabs → Today/Inbox are dark too. The app must **not** restart/reload (watch Metro: no new bundle load). Tap **Light** (`appearance-theme-light`) → light even if the device is in dark mode (`adb shell cmd uimode night yes`). Tap **System** (`appearance-theme-system`) → follows the device again (toggle `cmd uimode night yes/no` and watch it follow).
4. **Persist, no flash (AC2).** With the device in light mode (`adb shell cmd uimode night no`), choose **Dark**, then `adb shell am force-stop <package>` and relaunch → the first app screen after the splash is already dark, with no light frame (record with `adb shell screenrecord /sdcard/start.mp4` if unsure); Settings → Appearance shows Dark selected. Set back to System.
4b. **Sign out (AC1).** On Settings tap **Sign out** → a confirm dialog. **Cancel** → still on Settings, signed in. Tap again → confirm → the sign-in screen; relaunch → still on sign-in. Sign back in → Today; your tasks are still there; Settings shows your email again.
4c. **Legal (TB-54 in the shell).** On Settings, a **Legal** section below Preferences shows Privacy Policy, Terms of Use and How AI uses your data (`settings-legal-links`); each opens in the system browser.
5. **Unknown page.** `adb shell am start -a android.intent.action.VIEW -d "taskbuddy://settings/nope"` → "This settings page doesn't exist." with Back.
6. **Regression.** Today/Inbox tasks still listed after the migration; task modal (`taskbuddy://task/<id>`) still opens. TalkBack on the Settings list: "Appearance, button" with the description as hint; theme chips read as radio buttons with checked state.

## TB-20 merge (sign-out row)
Done in round 2 (merge commit 706ec3f, feature commit 5a7cbd6) as planned: old placeholder kept deleted, `SignOutButton` row in the Account section, `useAccountEmail` reads `useSession()`, root layout keeps both TB-20's guard and `AppearanceSync`.

## TB-54 (legal links)
Done in merge commit 9fd6c78: PR #21 had added `LegalLinks` to the old placeholder Settings screen. The placeholder stays deleted; `registry/sections.ts` has a **Legal** section (after Preferences) with a custom row `SettingsLegalLinksRow` rendering `<LegalLinks testID="settings-legal-links" />`. TB-54's `settings-legal-links-route.test.tsx` passes unchanged against the registry shell.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Important | First commit split left the old Settings route deleted without its replacement (broken intermediate commit) | self | Commits rebuilt before handoff: 7b9d5ce (data layer) then 95dae9b (screen + routes) |
| 2 | Minor | `usePreference` optimistic update ran in async `onMutate`, so the new value appeared a tick after the tap | self | Synchronous `setQueryData` in `setValue`, rollback in `onError` (spec D7) |
| 3 | Minor | `value: query.data ?? default` would hide a legitimately `null` preference value | self | Uses `=== undefined` check |
| 4 | Important | Start-up theme flash: `AppearanceSync` read the stored theme asynchronously after the first frame (`AppearanceSync.tsx:14-16`) | reviewer (PR #19) | `DbGate` gained an optional `onReady(db)` run synchronously after migrations, before children render; the root layout passes `applyStoredAppearance` (reads the preference, calls `Appearance.setColorScheme`, never throws). Tests: `apply-stored-appearance.test.tsx`, `DbGate.test.tsx` |
| 5 | Important (low) | On write error, restoring `previous` could overwrite a later successful write (`use-preference.ts:28-43`) | reviewer (PR #19) | `onError` re-reads with `invalidateQueries`; it puts `previous` back at once only if the failed tap is still the latest (write counter), so the UI doesn't flicker to a stale value and still recovers if the re-read fails too. An older write's `onSuccess` no longer overwrites a newer optimistic value. Test: `use-preference.test.tsx` |
| 6 | Nit | Page-row slugs were free strings, so a typo would compile | reviewer (PR #19) | `page` rows hold the `SettingsPageDefinition` itself (`{ kind: 'page', page }`); `registry/pages.test.ts` checks slugs |
| 7 | Nit | No device step for re-pressing the Settings tab on a pushed page | reviewer (PR #19) | Manual step 2b + route test |

## Known limitations & follow-ups
- Start-up: `Appearance.setColorScheme` updates React Native's JS appearance state at once, but `UiProvider` (above `DbGate`) re-renders on the native appearance-changed event. If one light frame still shows on device (step 4), also hold the splash until `DbGate` is ready (`expo-splash-screen`, already a dependency), the reviewer's second option.
- `guardDb`/`RepoError` and the task test helpers are imported from `features/tasks`; hoist them to `src/lib` (and a shared testing folder) in a small refactor ticket.
- Which preferences sync (and whether theme is per device) is for TB-43.
- E2E (Maestro) flow for Settings once `.maestro/` exists.

## Completion
- [x] All AC met with Jest evidence (emulator proof: coordinator)
- [x] Gates green locally and in CI
- [x] No open Blocking findings
- [x] Jira moved to In Review (Done: coordinator after merge)
