# TB-18 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-18 · Blueprint: US-004 · Wave 1 (batch C, critical path) · Risk: Medium (see "Risk tier" below)
> Status: Draft — awaiting owner acceptance

## Problem
The app has one route (`/`), which shows the TB-17 design-system showcase. The product's main areas (Today, Inbox, Buddy, Settings) don't exist, and there is nowhere to open a single task. Five tickets need this structure before they can start: TB-20 (sign-in sits beside the tabs), TB-26 (task CRUD opens the task modal), TB-32 (Settings tab), and TB-65/TB-66 (analytics and localization of the shell).

## Desired outcome
- A bottom tab bar with **Today, Inbox, Buddy, Settings**. Tapping a tab shows its screen in under 300 ms.
- A **task detail modal** at `/task/<id>` that opens from inside the app and from the deep link `taskbuddy://task/<id>`, including on a cold start.
- The Android back gesture and the iOS dismiss gesture close the modal, and the screen underneath keeps its state (scroll, typed text, selected tab).
- Thin routes in `src/app/`, with screen components in `src/features/*` that later tickets replace in place.

## Affected users
All app users (navigation is the first thing they touch). Developers on TB-20, TB-26, TB-27, TB-28, TB-32, TB-65 and TB-66 build on these routes.

## Constraints
- Stack locked by CLAUDE.md §2: Expo Router 58, NativeWind token theme. Reuse the TB-17 primitives (`Button`, `Card`, …) and tokens; don't use `BottomSheetModal`.
- Routes stay thin. Only route files go in `src/app/` (CLAUDE.md §3).
- **No new native dependency if avoidable.** The dev client is already built, and a new native module means a new EAS build. Any option that needs one says so.
- `src/app/_layout.tsx` is a shared hotspot. TB-21 (in flight) will wrap the root in `<DbGate>`, and TB-20 will add an `(auth)` group. Keep the root-layout diff small and easy to rebase.
- The deep-link `id` is untrusted input: validate it, render it only as text, and keep it out of logs.
- Machine constraints for this session: no Metro, emulator, Docker or EAS build. On-device checks go to the owner or coordinator (see plan).

## Risk tier
By the workflow table (`docs/workflow/README.md` §5), 2 pts with no high-risk area is **Low**. **Recommended: treat it as Medium.** It owns the shared root layout, it fixes the route and deep-link contract for five downstream tickets on the critical path, and it parses untrusted deep-link input. So it gets the full intent/spec/plan set and an independent reviewer. The owner may downgrade it to Low (compact README) when accepting.

## Out of scope
- Real Today/Inbox lists (TB-27), task CRUD and data in the modal (TB-26, TB-28), Settings content (TB-32), Buddy chat (TB-55), sign-in routing and guards (TB-20).
- Universal links / https app links (only the custom `taskbuddy://` scheme).
- Tab badges, Maestro E2E flows (TB-52), localization of the labels (TB-66).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Tab bar: JS `Tabs` or native `NativeTabs`? (spec D1) | Native look vs no rebuild and full theming/testability | |
| 2 | How is the 300 ms AC measured? (spec D2) | Can't be proven in Jest. Needs a device or emulator proxy | |
| 3 | Modal presentation: `modal`, `formSheet` or `card`? (spec D3) | iOS gesture semantics ("swipe-back") and the look | |
| 4 | What does Today show, and what does the modal show before TB-26? (spec D4) | TB-17's "every primitive used on a screen" AC depends on the showcase staying | |
| 5 | Risk tier Medium (recommended) or Low? | Doc set and review depth | |
