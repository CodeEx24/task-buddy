# TB-18 — Verification

> Jira: https://stratyge.atlassian.net/browse/TB-18 · PR: https://github.com/CodeEx24/task-buddy/pull/10 (merged `8974964`) · Branch: `feat/tb-18/app-shell`
> Record only what was actually run and observed. `node scripts/workflow/check-ticket-docs.mjs --branch <branch> --pr` fails the PR gate while any AC row is `not met`, `partial` or `TBD`.

## Commands run
Run on 2026-10-28 in the worktree, on `origin/main` @ `4c9134a` (TB-21 not merged yet), in CI order.

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | pass | Lockfile adds `@expo/vector-icons` 15.1.1 and the direct `expo-font` 58.0.10 entry |
| `pnpm lint` | pass | 0 errors, 0 warnings |
| `pnpm typecheck` | pass | `tsc --noEmit`, strict |
| `pnpm test --ci` | pass | 15 suites, 119 tests (12 s) |
| `npx expo export --platform android --output-dir <scratchpad>` | pass | One Hermes bundle (`entry-….hbc`, 4.2 MB). Exactly one `.ttf` asset (Ionicons only, because of the per-family import `@expo/vector-icons/Ionicons`) |
| `node scripts/workflow/check-ticket-docs.mjs --branch feat/tb-18/app-shell` | pass | `workflow check: ok` (without `--pr`; the AC rows below are still partial) |

**expo-doctor** (`pnpm dlx expo-doctor`): 19/20. The one failed check is the known patch-version drift that also shows on `main` (expected `expo ~58.0.20`, `expo-dev-client ~58.0.16`, `expo-router ~58.0.27`; installed 58.0.19 / 58.0.15 / 58.0.26). Not bumped, per the coordinator.

An earlier run also failed "Missing peer dependency: expo-font (required by @expo/vector-icons)". It was fixed by adding `expo-font ~58.0.10` directly; see spec Deviations.

**Tests catch regressions (mutation checks; each change was reverted after):**
- Removing the root `anchor` fails "back from a deep-linked modal lands on Today".
- `router.replace` instead of `push` for the sample task fails both AC3 tests.
- `lazy: true` fails 4 tests.
- Disabling `markPress` fails the timing-log test.
- Removing the active-tab guard fails "re-tapping the active tab starts no measurement" on its `[tab-switch] index` assertion.

## Commands run: Android emulator device checks, 2026-10-28
On `main` @ `4d42e5e` (TB-18 + TB-21). Emulator `Medium_Phone_API_37.0` (gesture navigation, mode 2), EAS dev build `e98f091e`, Metro `EXPO_PUBLIC_TAB_TIMING=1 expo start --dev-client --no-dev --minify` (step 0).

| Command | Result | Notes |
|---|---|---|
| AC1: 20 taps per tab, `[tab-switch]` log (120 samples) | pass | inbox 20 p50 35.6 / **p95 51.0** / max 96.8 ms; index 60 p50 34.5 / **p95 50.1** / max 51.1; buddy 20 p50 34.0 / **p95 49.8** / max 50.4; settings 20 p50 33.9 / **p95 50.3** / max 52.3. Budget 300 ms |
| AC2 cold: force-stop, `am start -d taskbuddy://task/0190f3b2-…` | pass | Dev launcher opens first (dev builds only); after picking the server the link is forwarded and `task-detail-modal` is shown (`deeplink-cold.png`). Back → `home-screen` (Today) |
| AC2 warm: on Settings, same link | pass | `task-detail-modal` shown (`deeplink-warm.png`); back → Settings still selected (`deeplink-warm-back.png`) |
| AC2 malformed: `taskbuddy://task/not%20a%20task` | pass | "This link doesn't point to a task." (`deeplink-malformed.png`) |
| AC3 back key: type "Buy milk", Open sample task, KEYCODE_BACK | pass | Modal closed, field still "Buy milk" (`back-keeps-state.png`) |
| AC3 back gesture: left-edge swipe `input swipe 5 1200 500 1200 150` | pass | Modal closed, field still "Buy milk" (`gesture-keeps-state.png`) |
| EAS Simulator for iOS (`simulator:availability`) | pass | Read-only check: `available: false` on account codeex24, so no remote iOS run. iOS swipe-down stays the owner's device check |

## Acceptance criteria
| AC (verbatim) | Status | Evidence (test name, file:line, screenshot, observed result) |
|---|---|---|
| Given the app is open, when I tap each tab, then the matching screen renders in under 300 ms | met | **Emulator: p95 49.8–51.0 ms per tab** (≥ 20 samples each, production-mode bundle), budget 300 ms. `src/features/navigation/app-shell-routes.test.tsx` → "AC1: tab navigation": the four tabs in order; "tapping Inbox/Buddy/Settings shows its screen" (target hidden before the press, visible and selected after, Today hidden); "tapping Today from another tab"; "mounts every tab up front" (`lazy: false`); "logs the dev-only tab-switch time"; "re-tapping the active tab starts no measurement". Timer unit tests in `tab-switch-timing.test.ts`. **The < 300 ms p95 has to come from the emulator run below (owner decision D2)** |
| Given the deep link `taskbuddy://task/<id>`, when opened, then the task detail modal is shown | met | **Emulator:** cold and warm `taskbuddy://task/<id>` open the modal; back lands on Today (cold) or keeps Settings (warm); malformed id shows the error (`deeplink-*.png`). "AC2: task deep link": the `taskbuddy://` URL goes through expo-router's native URL-to-path step (`extractExpoPathFromURL` → `task/<id>`) and renders the modal; `/task/<id>` opens the modal with the id; back from a cold deep-linked modal lands on Today (`anchor: '(tabs)'`); a malformed id shows "This link doesn't point to a task". `TaskDetailModal.test.tsx` covers the valid and invalid states and both Close paths. `task-id.test.ts`: 15 accept/reject cases |
| The Android back gesture and iOS swipe-back close the modal without losing state | met | **Android (emulator, 2026-10-28):** back key and back gesture keep "Buy milk" (`back-keeps-state.png`, `gesture-keeps-state.png`). **iOS (owner, physical iPhone, 2026-10-28):** the owner reports the swipe-down closed the sheet and the typed text was still there (`docs/actions/ios-modal-swipe-check.md`; owner-reported, not observed by the agent). "AC3": type "Buy milk" on Today → Open sample task → the hardware back key (React Navigation's `hardwareBackPress` listener) closes the modal, the pathname is `/` and the input still shows "Buy milk". The same holds through Close. iOS "swipe-back" means the sheet's swipe-down dismiss (owner decision D3); it can't be simulated in Jest |
| Done gates: tests added and passing, no regressions, PR reviewed, docs/tickets note updated | met | PR #10 merged by the owner with CI green (`8974964`). After TB-21 merged on top: 27 suites / 181 tests pass on `main`, CI green. Independent reviewer agent run; findings below. `docs/tickets/TB-18/` updated with device evidence |

## Manual / E2E
No device run in this session: the worker may not start Metro or an emulator (low memory). **The coordinator runs the steps below** on the Android emulator (`emulator-5554`) with the TB-16 dev client (package `com.codeex24.taskbuddy`). Save screenshots into `docs/tickets/TB-18/`, then move each AC row to `met` with the observed result.

**0. Start a production-mode bundle with the timer on** (from the worktree root):
```bash
# Git Bash
EXPO_PUBLIC_TAB_TIMING=1 pnpm start --no-dev --minify
# PowerShell
$env:EXPO_PUBLIC_TAB_TIMING='1'; pnpm start --no-dev --minify
```
Open the dev client on the emulator and connect to this server. Confirm the app lands on Today with the tab bar.

**AC1 — tab timing (20 taps per tab, p95 < 300 ms):**
```bash
adb shell uiautomator dump /sdcard/ui.xml
adb shell cat /sdcard/ui.xml | grep -o 'resource-id="tab-[a-z]*"[^>]*bounds="[^"]*"'
# Take each tab's centre from its bounds: X_INDEX, X_INBOX, X_BUDDY, X_SETTINGS and the shared Y.
adb logcat -c
for T in X_INBOX X_BUDDY X_SETTINGS; do      # substitute the numbers
  for i in $(seq 20); do adb shell input tap $T Y; sleep 1; adb shell input tap X_INDEX Y; sleep 1; done
done                                           # the Today taps give the index samples (60 of them)
adb logcat -d -s ReactNativeJS | grep "\[tab-switch\]" > tab-switch.log
python -c "import re,collections;d=collections.defaultdict(list);[d[m[1]].append(float(m[2])) for m in re.finditer(r'\[tab-switch\] (\w+) ([\d.]+)ms',open('tab-switch.log').read())];[print(k,len(v),'p95=%.1fms'%sorted(v)[max(0,int(round(.95*len(v)))-1)]) for k,v in d.items()]"
```
Pass when every tab has ≥ 20 samples and p95 < 300 ms. Paste the output into this file.

**AC2 — deep link, cold and warm:**
```bash
# Cold start
adb shell am force-stop com.codeex24.taskbuddy
adb shell am start -W -a android.intent.action.VIEW -d "taskbuddy://task/0190f3b2-7c1a-7d4e-9b2f-3a6c8e1d5f42" com.codeex24.taskbuddy
#   If the dev launcher opens first, pick the running server; the link should then be forwarded. Note what happened.
adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml | grep -o 'resource-id="task-detail-modal"'
adb exec-out screencap -p > docs/tickets/TB-18/deeplink-cold.png
adb shell input keyevent KEYCODE_BACK        # expect Today (home-screen), not the launcher
# Warm start: switch to the Settings tab first, then
adb shell am start -W -a android.intent.action.VIEW -d "taskbuddy://task/0190f3b2-7c1a-7d4e-9b2f-3a6c8e1d5f42" com.codeex24.taskbuddy
adb exec-out screencap -p > docs/tickets/TB-18/deeplink-warm.png
adb shell input keyevent KEYCODE_BACK        # expect Settings still selected
# Malformed id
adb shell am start -W -a android.intent.action.VIEW -d "taskbuddy://task/not%20a%20task" com.codeex24.taskbuddy
#   expect "This link doesn't point to a task." and a Close button
```

**AC3 — back key and back gesture keep state:**
```bash
# On Today: tap the "Task name" field, then
adb shell input text "Buy%smilk"
# tap "Open sample task" (find it with uiautomator), then
adb shell input keyevent KEYCODE_BACK
adb exec-out screencap -p > docs/tickets/TB-18/back-keeps-state.png   # expect "Buy milk" still in the field
# Back gesture: turn on gesture navigation, open the sample task again, swipe from the left edge
adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural
adb shell input swipe 5 1200 500 1200 150
adb exec-out screencap -p > docs/tickets/TB-18/gesture-keeps-state.png
```
`app.json` has `predictiveBackGestureEnabled: false`, so the gesture arrives as the classic back event.

**iOS (owner, physical device, same pattern as TB-15):** type on Today, tap Open sample task, swipe the sheet down. The modal closes and the text is still there.

## Review findings
| # | Severity | Finding (file:line) | Source (self / reviewer agent / human) | Resolution |
|---|---|---|---|---|
| 1 | Blocking | `tab-switch-timing.ts`: the timer was `__DEV__`-only, but D2 measures on a `--no-dev` bundle, so it would log nothing | self + reviewer agent | Fixed in `640db62`: `isTabTimingEnabled(__DEV__, EXPO_PUBLIC_TAB_TIMING)` with unit tests; step 0 sets the flag. Spec deviation recorded |
| 2 | Important | `spec.md`: Deviations table empty while the timing mechanism and test files differed from the plan | reviewer agent | Fixed: Deviations rows added |
| 3 | Nit | `AppTabs.tsx` `screenListeners`: re-tapping the active tab left a pending press that a later refocus reported (skews p95) | reviewer agent | Fixed: `navigation.isFocused()` guard, plus a regression test (mutation-checked) |
| 4 | Important | `app-shell-routes.test.tsx`: no test for the `taskbuddy://` URL form | reviewer agent | Fixed: the URL goes through `extractExpoPathFromURL` and then renders. `renderRouter`'s own parsing of scheme URLs differs from native linking (deviation recorded) |
| 5 | Nit | `TaskDetailModal.tsx` Close fallback (`replace('/')`) was untested | reviewer agent | Fixed: `TaskDetailModal.test.tsx` covers both Close paths |
| 6 | Nit | The tab "in order" test didn't check order | reviewer agent | Fixed: compares the tree order of the `tab-*` buttons |
| 7 | Important | expo-doctor: `expo-font` missing as a direct peer of `@expo/vector-icons` | self (gate) | Fixed in `a3b7b0a`. The `app.json` plugin entry `expo install` added was reverted (not an owned path; a no-op without options) |

## Known limitations & follow-ups
- **Device evidence done (2026-10-28).** Android on the emulator; iOS swipe-down checked by the owner on a physical iPhone. EAS Simulator is not enabled on the account.
- The JS tab bar isn't the platform-native bar. Proposed follow-up: switch to `NativeTabs` (`expo-router/native-tabs`) together with `expo-symbols` at the next native build, TB-38 (owner D1, option C).
- `lazy: false` mounts all four tabs at start. That's cheap with placeholders. Revisit in TB-63 (performance budgets) once TB-27/TB-32/TB-55 put real content in the tabs.
- `src/app/_layout.tsx` will conflict with TB-21's `<DbGate>` wrap, but only trivially. Whichever ticket merges second rebases (keep both: `DbGate` around the `Stack`, the TB-18 `Stack.Screen` children and the `unstable_settings` export).
- Tab labels are English literals in `src/features/navigation/tabs.ts`, for TB-66 (localization) to pick up.

## Completion
- [x] All AC met with evidence (Android on the emulator; iOS swipe-down reported by the owner on 2026-10-28)
- [x] Gates green locally and in CI
- [x] No open Blocking findings
- [ ] Jira updated (In Review → Done): coordinator
