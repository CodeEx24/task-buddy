# TB-53 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-53 · Blueprint: US-039 · Wave 4 · Risk: High (account deletion / export, auth, server data)
> Status: **Accepted by the orchestrator (coordinator session) on 2026-10-28**, acting for the owner, who was not available. The decisions were taken from the coordinator's brief (recommended options) and are recorded in [spec.md](spec.md#decisions).

## Problem
A user can't take their tasks out of Task Buddy or delete their account from the app. The live privacy policy (TB-54, `legal-site/privacy.html#delete-account`) says an in-app option is "coming in a future update" and asks people to email us. Both app stores require more before submission (TB-64):
- **Apple** (App Review Guideline 5.1.1(v)): an app that lets people create an account must let them start deleting it **in the app**, and deletion must remove the account, not only deactivate it.
- **Google Play** (Account deletion policy): an in-app path **and** a web resource where people can ask for deletion without reinstalling the app.

Since TB-43, tasks, lists and steps are backed up to Supabase, and since TB-23 every AI call leaves a usage-ledger row, so "delete my data" now means server rows as well.

## Desired outcome
- Settings → Account → **Export my data** produces a JSON file of the user's tasks (with lists, steps and tags) and opens the OS share sheet with it. Works offline.
- Settings → Account → **Delete account** → confirm deletes the Supabase Auth user and every server row they own (profile, lists, tasks, subtasks, AI usage ledger and counters) at once, removes the account's data from the device, and signs them out.
- Both are reachable in three taps or fewer from anywhere in the app.

## Affected users
Every signed-in user (free tier; there is no Pro yet). Store reviewers, who check the deletion path.

## Constraints
- Server-only code in `supabase/functions`; the service-role key never reaches the app (CLAUDE.md §3–4).
- A user can delete only their own account: the identity comes from Supabase Auth, never from the request.
- Every table has RLS; synced tables are soft-deleted on the device (TB-43); one local DB file per account (TB-43 D5).
- No new secrets; no destructive operation on real data while testing (local throwaway users only).
- Deletion needs the server, so offline must block with a clear message, not queue.

## Out of scope
- Importing an export file (the format is versioned so this can come later).
- Deleting data held by processors outside our Supabase project (Anthropic per its own retention; Sentry/PostHog are not integrated yet).
- Changing the published privacy policy text (owner's call; see the action guide).
- A server-side web deletion form (the privacy page's email route is the web path; see spec D6).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Export from the local DB or from the server? | Offline support; unsynced edits | Local DB (coordinator brief, 2026-10-28) → spec D1 |
| 2 | Native module for file sharing? | Needs a new dev build | Add `expo-sharing` + `expo-file-system`; new EAS dev build required (brief) → D2 |
| 3 | How are server rows removed? | Completeness, atomicity, future tables | Auth admin hard delete + `ON DELETE CASCADE`, guarded by pgTAP → D3 |
| 4 | Confirmation UX: type DELETE or destructive confirm? | Tap count (AC3) vs. accidental deletion | Destructive confirm dialog (3 taps) → D5 |
| 5 | Offline behaviour | Store rules, user trust | Block with a message, never queue (brief) → D4 |
