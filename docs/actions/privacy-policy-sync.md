# Update the privacy policy for sync before release

> Related: TB-43 (https://stratyge.atlassian.net/browse/TB-43), TB-54 | Wave 4 | legal
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
The live privacy policy (`legal-site/privacy.html`, TB-54) says tasks are "Stored on your device. Not uploaded, unless you use an AI feature (section 4) or a future sync or sharing feature that we will describe here before it launches", and section 13 promises an update before sync launches. TB-43 adds that sync: lists, tasks, notes, due dates, priorities and steps are now backed up to your Supabase project. Tags stay on the device. Legal wording is your call (and a lawyer's), so Claude didn't change the page. This must be done **before any build with sync reaches testers outside the team** (TB-38 beta) or the stores.

## Prerequisites
- Access to edit `legal-site/privacy.html` (or ask Claude to draft the change in a PR for your review).
- The facts from [legal-owner-facts.md](legal-owner-facts.md).

## Steps
1. In the data table row "Your tasks, notes, steps, due dates and priorities", change the last cell to something like: "Stored on your device and backed up to our backend provider, Supabase, so they sync to your other signed-in devices. Tags stay on your device."
2. In the retention section, add: "Deleted tasks are kept as a deletion marker for 30 days so your other devices remove them too, then erased from our servers."
3. Note that each account on a shared phone keeps its own separate local data.
4. Change the date at the top; if you consider it significant, plan an in-app notice (section 13).
5. Ask Claude to re-check the wording against the TB-43 spec, then publish.

## Expected result
The policy matches what the app does with task data.

## Verify
Open the published privacy page: the tasks row mentions backup/sync to Supabase and the 30-day deletion marker.

## Completion checklist
- [ ] Tasks row updated
- [ ] 30-day deletion marker described
- [ ] Date changed (and in-app notice decided)
- [ ] Published before the beta build with sync
- [ ] Status above set to Done

## If it fails
- Unsure about wording: ask Claude for a draft PR and have a lawyer review it; don't ship sync to outside testers until it's published.
