# packages/schemas

Shared Zod schemas used by the app and Edge Functions. Owner: TB-24 (AI output schemas).

Files import only `zod`, so they run under Node (app, Jest) and Deno (Edge Functions map `zod` in their `deno.json`). Edge Functions import them by relative path with the `.ts` extension.

| File | Contents | Ticket |
|---|---|---|
| `src/ai-gateway.ts` | AI gateway request, success and error envelopes; route names; error codes (`QUOTA_EXCEEDED` added by TB-23; `INPUT_TOO_LONG`, `AI_UNSAFE_OUTPUT` by TB-25) | [TB-22](https://stratyge.atlassian.net/browse/TB-22), [TB-23](https://stratyge.atlassian.net/browse/TB-23), [TB-25](https://stratyge.atlassian.net/browse/TB-25) |
| `src/ai-input.ts` | `sanitizeAiInput()`, `checkAiInput()`, `MAX_AI_INPUT_CODE_POINTS` (2,000): the input normaliser the gateway enforces and the app can use for a live counter | [TB-25](https://stratyge.atlassian.net/browse/TB-25) |
