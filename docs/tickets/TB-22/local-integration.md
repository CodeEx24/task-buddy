# TB-22 — Local integration run (curl transcript)

> Jira: https://stratyge.atlassian.net/browse/TB-22 · Spec: [spec.md](spec.md) · Verification: [verification.md](verification.md)

Run on 2026-10-28, Windows 11, Docker Desktop. Real Supabase Auth from the shared local stack (Supabase CLI 2.122.0, project `task-buddy`, API `127.0.0.1:54321`); the function served from this worktree with `supabase functions serve ai-gateway --env-file <file outside the repo>` (Edge Runtime 1.77.8, Deno 2.1.4, hot reload). The env file held only `ANTHROPIC_API_KEY=<random per-run dummy>` and `ANTHROPIC_BASE_URL=http://host.docker.internal:8787`, pointing the real Anthropic provider code at `scripts/ai-gateway/mock-anthropic.mjs`, which returns 401 unless it gets that exact dummy key and an `anthropic-version` header.

Command: `bash scripts/ai-gateway/local-check.sh` with `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` exported from `supabase status -o env` (never written to the repo). The script replaces every key, token and password with a placeholder before printing. Each run creates a fresh confirmed user through the Auth admin API and signs in with a password grant to get a real access token.

The check ran three times against the same served function: after the first build, after the timeout hardening, and after the review fixes (final code). All three gave the same statuses. The transcript and gateway log below are from the **final run**.

## Transcript (final run, verbatim, redacted by the script)

```text
# setup: create a confirmed local test user via the Auth admin API, then sign in
create user: HTTP 200
sign in: got an access token (794 chars, role authenticated)

### AC1: no token -> 401
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/parse -d '{"input":"buy milk tomorrow at 9"}'
HTTP 401
{"requestId":"6d31cd29-7a96-46ae-a9cb-ece2389baac8","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### AC1: garbage token -> 401
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/parse -H 'Authorization: Bearer not-a-jwt' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 401
{"requestId":"1c588b90-ba73-416c-a3a1-663054390e4e","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### AC1: anon key as bearer (valid JWT, no user) -> 401
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/plan -H 'Authorization: Bearer <ANON_KEY>' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 401
{"requestId":"6f27219b-aa23-4c8e-b3f5-c04e021a2f3d","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### AC1: service-role key as bearer (a JWT, but not a user) -> 401
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/plan -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 401
{"requestId":"262a4bd2-c8a7-4e37-82b6-157e305afb6f","error":{"code":"UNAUTHENTICATED","message":"A valid signed-in session is required."}}

### AC2: valid user JWT -> 200 on /parse
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/parse -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 200
{"requestId":"435bb1fe-284a-4856-af53-9f6af5f2e3c3","route":"parse","model":"claude-haiku-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}

### AC2: valid user JWT -> 200 on /breakdown
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/breakdown -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 200
{"requestId":"27951940-a0f6-4972-921d-ec4faa0b2846","route":"breakdown","model":"claude-sonnet-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}

### AC2: valid user JWT -> 200 on /plan
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/plan -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 200
{"requestId":"d4e60d0f-1077-4ce2-849a-ed2fb4b3c90f","route":"plan","model":"claude-sonnet-5-5","output":"{\"mock\":true,\"inputChars\":22}","usage":{"inputTokens":22,"outputTokens":8}}

### valid JWT, invalid body -> 400
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/parse -H 'Authorization: Bearer <USER_JWT>' -d '{"input":""}'
HTTP 400
{"requestId":"4bfb7b92-b5f9-479a-87c8-fb2d214226ec","error":{"code":"BAD_REQUEST","message":"The request body is invalid."}}

### unknown route -> 404
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/chat -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"buy milk tomorrow at 9"}'
HTTP 404
{"requestId":"4029e826-6713-46e6-b1b8-e5e3b07e3a7a","error":{"code":"NOT_FOUND","message":"Unknown AI route."}}

### AC2: provider slower than 20 s -> 504 AI_TIMEOUT
$ curl -X POST http://127.0.0.1:54321/functions/v1/ai-gateway/plan -H 'Authorization: Bearer <USER_JWT>' -d '{"input":"SLOW"}'
HTTP 504
{"requestId":"494d0c09-3964-4451-a369-6ef0860f85b8","error":{"code":"AI_TIMEOUT","message":"The AI service took too long to answer."}}

elapsed: 20 s (mock answers after 25 s)
```

## Gateway log lines (final run, from `functions serve`)

```text
[Info] {"fn":"ai-gateway","requestId":"9fe16da9-8f2f-4087-8188-04c877dfd577","route":"plan","status":504,"durationMs":20008,"model":"claude-sonnet-5-5"}
[Info] {"fn":"ai-gateway","requestId":"6d31cd29-7a96-46ae-a9cb-ece2389baac8","route":"parse","status":401,"durationMs":1,"model":"claude-haiku-5-5"}
[Info] {"fn":"ai-gateway","requestId":"1c588b90-ba73-416c-a3a1-663054390e4e","route":"parse","status":401,"durationMs":5,"model":"claude-haiku-5-5"}
[Info] {"fn":"ai-gateway","requestId":"6f27219b-aa23-4c8e-b3f5-c04e021a2f3d","route":"plan","status":401,"durationMs":2,"model":"claude-sonnet-5-5"}
[Info] {"fn":"ai-gateway","requestId":"262a4bd2-c8a7-4e37-82b6-157e305afb6f","route":"plan","status":401,"durationMs":2,"model":"claude-sonnet-5-5"}
[Info] {"fn":"ai-gateway","requestId":"435bb1fe-284a-4856-af53-9f6af5f2e3c3","route":"parse","status":200,"durationMs":15,"model":"claude-haiku-5-5","providerCalls":1,"usage":{"inputTokens":22,"outputTokens":8}}
[Info] {"fn":"ai-gateway","requestId":"27951940-a0f6-4972-921d-ec4faa0b2846","route":"breakdown","status":200,"durationMs":5,"model":"claude-sonnet-5-5","providerCalls":1,"usage":{"inputTokens":22,"outputTokens":8}}
[Info] {"fn":"ai-gateway","requestId":"d4e60d0f-1077-4ce2-849a-ed2fb4b3c90f","route":"plan","status":200,"durationMs":6,"model":"claude-sonnet-5-5","providerCalls":1,"usage":{"inputTokens":22,"outputTokens":8}}
[Info] {"fn":"ai-gateway","requestId":"4bfb7b92-b5f9-479a-87c8-fb2d214226ec","route":"parse","status":400,"durationMs":5,"model":"claude-haiku-5-5"}
[Info] {"fn":"ai-gateway","requestId":"4029e826-6713-46e6-b1b8-e5e3b07e3a7a","route":null,"status":404,"durationMs":0}
[Info] {"fn":"ai-gateway","requestId":"494d0c09-3964-4451-a369-6ef0860f85b8","route":"plan","status":504,"durationMs":20005,"model":"claude-sonnet-5-5","providerCalls":1,"errorKind":"timeout"}
```

The log carries request id, route, status, model, duration, provider call count, token usage and the failure kind only: no input text, token or key. The slow call ended at about 20 s with 504 `AI_TIMEOUT` (`errorKind: "timeout"`) while the mock would have answered at 25 s (AC2 timeout).

## Mock provider log (all three runs: every request that reached the "provider")

```text
mock-anthropic: listening on 8787
mock-anthropic: 200 model=claude-haiku-5-5 max_tokens=1024
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=2048
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
mock-anthropic: 200 model=claude-haiku-5-5 max_tokens=1024
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=2048
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
mock-anthropic: 200 model=claude-haiku-5-5 max_tokens=1024
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=2048
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
mock-anthropic: 200 model=claude-sonnet-5-5 max_tokens=4096
```

Four provider calls per run: `/parse` (haiku, 1024 tokens), `/breakdown` (sonnet, 2048), `/plan` (sonnet, 4096) and the slow `/plan`. **None for the 401s (no token, garbage, anon key, service-role key), the 400 or the 404**, so the provider is never called for an unauthenticated request (AC1). The first run had no service-role case; it was added after review.

## Bundle check (AC3)

`ANTHROPIC_API_KEY` was set in the shell to a per-run `sk-ant-`-shaped canary, then `pnpm exec expo export --platform android` and `node scripts/check-bundle-secrets.ts <export dir>`:

```text
check-bundle-secrets: 29 files scanned, no secrets found
```

A text search of the export for `canary`, `ANTHROPIC` and `ai-gateway` found 0 files. The CI `bundle` job repeats the export for Android and iOS on every PR.
