# Run the 200 golden AI inputs against the real model

> Related: TB-24 (https://stratyge.atlassian.net/browse/TB-24) | Wave 2 | closes TB-24 AC1
> Status: Open · Created by: Claude Code on 2026-10-28

## Purpose
TB-24 checks every AI answer against a schema and retries once when it doesn't fit. Its first acceptance criterion needs a number from the **real** model: of the 200 golden inputs in `evals/golden/`, at least 98 % must come back valid after at most one repair. The agents could only prove the logic and the arithmetic against a mock, because no Anthropic API key exists on this machine. This run gives the real number. Until then TB-24's AC1 stays `partial`. About 20 minutes, most of it waiting.

## Prerequisites
- The TB-24 PR checked out (or merged to `main`).
- An Anthropic API key. Use the same key as [ai-gateway-deploy.md](ai-gateway-deploy.md), from a workspace that has a **monthly spend limit**. The run makes 200 to 400 requests: parse on the cheap model, breakdown and plan on the strong model. The runner stops by default at 200 requests and 400 000 tokens.
- Docker Desktop running and the local Supabase stack started (`npx supabase@2.122.0 start` in the repo).
- Credentials needed (names only): `ANTHROPIC_API_KEY`. Local `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` come from `npx supabase@2.122.0 status -o env`.

## Steps
1. Create a file **outside the repo**, for example `%USERPROFILE%\tb-ai-local.env`, with one line: `ANTHROPIC_API_KEY=<your key>`. Do not set `ANTHROPIC_BASE_URL`: without it the gateway calls the real API. Never put the key in the repo, on the command line or in chat.
2. In one terminal, in the repo root, serve the gateway:
   ```bash
   npx supabase@2.122.0 functions serve ai-gateway --env-file "%USERPROFILE%\tb-ai-local.env"
   ```
3. In a second terminal (Git Bash), in the repo root:
   ```bash
   eval "$(npx supabase@2.122.0 status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' | sed 's/^/export /')"
   bash scripts/ai-gateway/golden-local.sh --rps 1 --out golden-real.json
   ```
   This creates a local test user, signs in, and sends the 200 cases one per second. It prints only counts and case ids, never your inputs, outputs or keys.
4. Look at the last lines. You want `AC1 (>= 98.0%): PASS`. `not valid:` lists the case ids that failed.
5. Paste the printed summary (not `golden-real.json`) into the TB-24 Jira issue as a comment, or give it to the agent. The agent then sets AC1 to `met` in `docs/tickets/TB-24/verification.md`, or opens a follow-up to tune the prompts (`prompts/<route>.v2.ts`) if the rate is below 98 %.
6. Delete `%USERPROFILE%\tb-ai-local.env` and `golden-real.json`. Stop the serve command with Ctrl+C.

Hosted alternative: once the gateway is deployed with the key ([ai-gateway-deploy.md](ai-gateway-deploy.md)), run `USER_JWT=<a test user's access token> pnpm eval --url https://<project-ref>.supabase.co/functions/v1/ai-gateway --rps 1`.

## Expected result
The summary prints the number of golden cases (200), `valid after <= 1 repair: N/200 (≥ 98.0%)`, a line per route, and `AC1 (>= 98.0%): PASS`. The runner exit code is 0.

## Verify
- The serve terminal shows one JSON log line per request, with `"promptVersion":"parse.v1"` (or `breakdown.v1`, `plan.v1`) and an `outputCheck` of `valid`, `repaired` or `invalid`. No request shows more than `"providerCalls":2`.
- In the Anthropic Console, usage for that day matches a few hundred requests and stays under your limit.

## Completion checklist
- [ ] Real-model run done and the summary shows ≥ 98 %
- [ ] Summary posted on TB-24 (or handed to the agent)
- [ ] `docs/tickets/TB-24/verification.md` AC1 set to `met` with the numbers
- [ ] Local env file with the key deleted

## If it fails
- `sign-in failed`: the local stack isn't running, or the `status -o env` export didn't work. Check `echo $API_URL` prints `http://127.0.0.1:54321`.
- Many `502 AI_PROVIDER_ERROR`: the key is wrong or out of credit. Check the serve log's `upstreamStatus` (401 = bad key, 429/529 = rate limit or overload; rerun with `--rps 0.5`).
- Many `504 AI_TIMEOUT`: the model took longer than 20 s. Rerun later. If it keeps happening on `/plan`, tell the agent.
- Rate below 98 %: not an error in the run. Send the summary (the case ids only) to the agent. It will look at the failing ids and propose a `v2` prompt or a schema change.
- `stopped early at max-tokens`: raise the cap with `--max-tokens 800000` only if your spend limit allows it.
