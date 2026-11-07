# TB-22 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-22 · Blueprint: US-008 · Wave 2 (batch A) · Risk: **High** (AI gateway, auth, secrets)
> Status: **Accepted** by the coordinator on 2026-10-28 (no human available; every decision took the recommended option, see [spec.md](spec.md#decisions))

## Problem
Every AI feature (quick-add parse, task breakdown, daily plan, later check-ins and chat) needs an LLM, but the app must never hold a provider key or call an LLM directly (CLAUDE.md §1, AGENTS.md). There is no server-side entry point for AI yet, and the guardrail tickets that follow (TB-23 rate limits, TB-24 output validation, TB-25 input hardening) need a place to plug in without editing each other's code.

## Desired outcome
- A Supabase Edge Function `ai-gateway` with routes `/parse`, `/breakdown`, `/plan`.
- It verifies the caller's Supabase JWT itself. Unauthenticated calls get 401 and never reach the provider.
- Each route uses its configured model (cheap for parse, strong for breakdown and plan; ids from env) and gives up on the provider after 20 seconds.
- The LLM vendor sits behind an `AiProvider` interface (Anthropic implementation via `fetch`), so tests inject a fake and the vendor can be swapped.
- The provider key exists only as the Edge Function secret `ANTHROPIC_API_KEY`. The bundle scan and the `src/` static guard fail if the key or its name ever reaches the app.
- A **middleware-pipeline contract** (wave plan, Wave 2 step 2): TB-23 and TB-25 each add one file plus one registration line; TB-24 wraps the provider result the same way.

## Affected users
- Developers of TB-23/24/25 and of every AI feature (TB-29..31, TB-34, TB-46, TB-58, TB-69).
- End users indirectly: their task text goes only to the gateway, authenticated, and is never logged.
- The owner: sets the Edge Function secret and deploys the function once a provider key exists (`docs/actions/ai-gateway-deploy.md`).

## Constraints
- Claude via the gateway only; cheaper model for parse/check-ins, stronger for plan/review/chat (CLAUDE.md §2). Model ids from env/config, not scattered literals.
- No task text or tokens in logs (AGENTS.md).
- Out of scope, but hook points required: rate limits and quotas (TB-23), output schemas and repair (TB-24), injection filtering (TB-25), cost ledger (TB-23).
- Agents cannot edit `.github/workflows/*.yml` (protected-path hook); CI changes go to the owner as a guide.
- No real provider key is available or needed: the local run uses a mock provider server.
- Blocker TB-20 (email OTP sign-in) is still In Progress in Jira. The gateway only needs Supabase Auth to issue JWTs (available in the local stack and both hosted projects), not TB-20's UI, so the coordinator dispatched TB-22 in parallel. Recorded as a deviation in spec.md.

## Out of scope
- Rate limits, quotas, usage ledger (TB-23). Output schemas, `AI_BAD_OUTPUT` repair retry (TB-24). Prompt-injection filtering (TB-25).
- Real prompts per feature (TB-30, TB-31, TB-34). The gateway ships short placeholder system prompts.
- The app-side gateway client (first consumer: TB-29).
- Hosted deploy and the secret value (owner action).

## Open questions
| # | Question | Why it matters | Answer (who, date) |
|---|---|---|---|
| 1 | Verify the JWT in the function, at the platform (`verify_jwt`), or both? | Where the 401 is enforced and tested; compatibility with asymmetric signing keys | In the function, `verify_jwt = false` (D1; coordinator, recommended, 2026-10-28) |
| 2 | Which model tier does `/breakdown` use? | Cost vs. quality; CLAUDE.md names only parse (cheap) and plan (strong) | Strong (D2) |
| 3 | Anthropic SDK or plain `fetch`? | Cold start, dependencies, testability | Plain `fetch` behind `AiProvider` (D3) |
| 4 | How do the tests run in CI without editing workflow YAML? | AC4 needs tests in CI | Jest project `edge-functions` (runs in the existing `ci` job); `deno check` step proposed to the owner (D4) |
| 5 | How is "valid request → 200" proven locally without a real key? | AC2 evidence | Local mock server via `ANTHROPIC_BASE_URL`; no fake-provider code path ships (D5) |
| 6 | Shape of the middleware contract? | TB-23/24/25 must not collide | Onion `(ctx, next)` middleware, fixed stage order, one registration array (D6) |
