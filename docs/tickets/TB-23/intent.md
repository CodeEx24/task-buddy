# TB-23 — Intent

> Jira: https://stratyge.atlassian.net/browse/TB-23 · Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md)
> Risk tier: **high** (AI gateway, rate limits / quotas, new Postgres tables with RLS, migration).

## Problem
TB-22 put every AI call behind the `ai-gateway` Edge Function with JWT auth, but any signed-in user can still call it without limit. One bug in the app, a script, or an abusive account could run up the Anthropic bill in minutes, and nobody can see what each call cost.

## Outcome
- Every AI call is counted per user: at most 30 calls per UTC hour and 50,000 tokens per UTC day on the free tier (configurable). Over the limit, the gateway answers 429 with `Retry-After` and never calls the provider.
- Every provider call leaves one ledger row (user, route, model, tokens, estimated cost) for cost tracking and later tiers (TB-78) and billing (TB-77).
- The app has a ready-made, friendly way to show "try again later" so TB-29 (quick-add) only has to call it.

## Users
- **End users** (free tier): see a calm message instead of an error when they hit a limit.
- **Product owner**: caps cost and abuse from day one; can query spend per user/model.

## Constraints
- CLAUDE.md invariants: AI calls pass auth, rate limit, quota and schema validation; every Postgres table has RLS with a test; migrations reversible; no secrets client-side; no task text in logs.
- TB-22's middleware contract (`pipeline.ts`): one middleware file, registered in `middleware/index.ts`.
- Counting must be atomic under concurrency (no read-then-write in the function).
- No human available for decisions: the implementer picks the recommended option and records why (orchestrator brief).

## Open questions (answered in spec.md → Decisions)
1. Fixed or rolling hour window?
2. Daily token quota default?
3. Where do counters live and how are they made atomic?
4. What happens when the ledger write fails, or the limit check itself fails?
5. How is AC1's "the app shows a friendly message" met with no AI screen yet?
