---
name: gh-fix-ci
description: Inspect GitHub PR checks with gh, pull failing GitHub Actions logs, summarize failure context, then create a fix plan and implement after user approval. Use when a user asks to debug or fix failing PR CI/CD checks on GitHub Actions and wants a plan + code changes; for external checks (e.g., EAS, Buildkite), only report the details URL and mark them out of scope.
metadata:
  short-description: Fix failing GitHub CI actions
---

# Fix failing PR checks

Use `gh` to locate failing PR checks, fetch GitHub Actions logs for actionable failures, summarize the failure, then propose a fix plan and implement only after explicit approval.

> Task Buddy edit: vendored from aitmpl `development/gh-fix-ci`. The upstream Python helper script is not included (use the `gh` commands below), and the instruction to escalate sandbox permissions was removed — never bypass permission prompts for this skill.

## Inputs

- `pr`: PR number or URL (optional; defaults to the current branch's PR)
- `gh` authenticated for the repo (`gh auth status`). If it is not, ask the user to run `gh auth login`; do not try to work around auth.

## Workflow

1. **Resolve the PR.** `gh pr view --json number,url,headRefName` (or use the number/URL the user gave).
2. **List checks.** `gh pr checks <pr> --json name,state,bucket,link,workflow`
   - If a field is rejected, rerun with the fields `gh` says are available.
3. **Get logs for each failing GitHub Actions check.**
   - Take the run id from the check link (`.../actions/runs/<run_id>/job/<job_id>`).
   - `gh run view <run_id> --json name,workflowName,conclusion,status,url,headBranch,headSha`
   - `gh run view <run_id> --log-failed` (only the failed steps; fall back to `--log` if empty).
   - Still in progress: `gh api repos/{owner}/{repo}/actions/jobs/<job_id>/logs`
4. **Scope external checks.** If the link is not a GitHub Actions run (e.g. EAS Build, Vercel), report the URL only.
5. **Summarize for the user.** Failing check name, run URL, and a short log excerpt with the real error (lint / typecheck / Jest / eval gate). Say clearly when logs are missing.
6. **Plan.** Propose a short fix plan (root cause, files to change, how to verify locally: `pnpm lint && pnpm typecheck && pnpm test`). Wait for approval.
7. **Implement after approval.** Minimal changes; run the matching local command; summarize the diff.
8. **Recheck.** Suggest `gh pr checks <pr> --watch` after pushing.

## Rules

- Never weaken a test, lint rule, or eval threshold to make CI pass; fix the cause or ask.
- Never print secrets from logs; summarize instead.
- Stage specific files only (never `git add -A`); never push to `main`.
