# packages/schemas

Shared Zod schemas used by the app and Edge Functions. Owner: TB-24 (AI output schemas).

Files import only `zod`, so they run under Node (app, Jest) and Deno (Edge Functions map `zod` in their `deno.json`). Edge Functions import them by relative path with the `.ts` extension.

| File | Contents | Ticket |
|---|---|---|
| `src/ai-gateway.ts` | AI gateway request, success and error envelopes; route names; error codes | [TB-22](https://stratyge.atlassian.net/browse/TB-22) |
| `src/ai-output.ts` | Strict per-route AI output schemas (`parsedTasksSchema`, `breakdownSchema`, `dayPlanSchema`), `AI_OUTPUT_SCHEMAS`, and `checkAiOutput(route, text)`, the one validator the gateway and the app both use | [TB-24](https://stratyge.atlassian.net/browse/TB-24) |
