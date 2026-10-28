# Check the task modal's swipe-down on an iPhone

> Related: TB-18 (https://stratyge.atlassian.net/browse/TB-18) | Wave 1 | PR #11
> Status: Done (2026-10-28, owner reported the swipe-down kept the text) · Created by: Claude Code on 2026-10-28

## Purpose
TB-18's third acceptance criterion says the Android back gesture **and the iOS swipe-back** close the task modal without losing what you typed. Android passed on the emulator (screenshots in `docs/tickets/TB-18/`). There is no Mac here, and Expo's cloud iOS simulator isn't enabled on the account, so only you can check iOS.

This unblocks: merging PR #11 and moving TB-18 to Done.

## Prerequisites
- Your iPhone with the Task Buddy development build or Expo Go (see [android-emulator-setup.md](android-emulator-setup.md), iPhone section).
- A computer on the same Wi-Fi running the dev server.

## Steps
1. On your computer, in the repo on `main`: `pnpm start`.
2. On the iPhone, open the app and connect to the dev server (scan the QR code).
3. On the **Today** tab, tap the **Task name** field and type `Buy milk`.
4. Tap **Open sample task**. The task detail sheet slides up.
5. Put your finger on the top of the sheet and **swipe down**.
6. Take a screenshot.

## Expected result
The sheet closes, you are back on Today, and the field still says `Buy milk`.

## Verify
- In PR #11 (https://github.com/CodeEx24/task-buddy/pull/11), edit `docs/tickets/TB-18/verification.md`. In the AC3 row, change `partial — …iOS swipe-down pending the owner's device` to `met`, and add "iOS: swipe-down kept 'Buy milk' (owner, <date>)". Optionally add your screenshot as `docs/tickets/TB-18/ios-swipe-keeps-state.png`.
- Or just tell Claude "iOS swipe check passed", and Claude will make the edit, merge PR #11 and move TB-18 to Done.

## Completion checklist
- [ ] Swipe-down closes the sheet
- [ ] The typed text is still there
- [ ] AC3 marked `met` in PR #11 (or Claude told)
- [ ] Status above set to Done

## If it fails
- **The sheet doesn't close on swipe:** note it on TB-18 in Jira. It's a bug to fix before Done, so Claude will open a fix.
- **The text is gone after closing:** same, note it and Claude will fix it.
- **The app can't connect to the dev server:** see "If it fails" in [android-emulator-setup.md](android-emulator-setup.md).
