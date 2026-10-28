# Make the Supabase and bundle checks required on main

> Related: TB-19 (https://stratyge.atlassian.net/browse/TB-19) | Wave 1 | PR #12
> Status: Done (2026-10-28, Claude set ci + supabase + bundle as required checks via gh api at the owner's request) · Created by: Claude Code on 2026-10-28

## Purpose
TB-19 adds two CI jobs next to `ci`:
- `supabase`: database security (RLS) tests, a type-drift check and a rollback check.
- `bundle`: makes sure no secret key ends up in the app.

Today only `ci` is required to merge into `main`, so a PR could still merge while these two are red. Only a repo admin can change that, so it's on you.

## Prerequisites
- Admin access to https://github.com/CodeEx24/task-buddy.
- PR #12 merged, so both jobs have run on `main` at least once. GitHub only offers checks it has seen.

## Steps
1. Open **Settings → Branches** (or **Rules → Rulesets**) → the rule for `main` → **Edit**.
2. Under **Require status checks to pass**, search for and add `supabase` and `bundle`. Keep `ci`.
3. Save.

Or from a terminal, as an admin:
```bash
gh api -X PATCH repos/CodeEx24/task-buddy/branches/main/protection/required_status_checks \
  -f strict=false -f 'contexts[]=ci' -f 'contexts[]=supabase' -f 'contexts[]=bundle'
```

## Expected result
The `main` rule lists three required checks: `ci`, `supabase` and `bundle`.

## Verify
`gh api repos/CodeEx24/task-buddy/branches/main/protection --jq .required_status_checks.contexts` prints `["ci","supabase","bundle"]`. Claude can run this for you.

## Completion checklist
- [ ] PR #12 merged
- [ ] `supabase` and `bundle` added as required checks
- [ ] Verify command shows all three
- [ ] Status above set to Done

## If it fails
- **`supabase` or `bundle` isn't in the search list:** the job hasn't run on `main` yet. Merge PR #12, wait for CI on `main`, then try again.
- **`gh api` returns 404:** your token lacks admin rights. Use the web UI instead.
