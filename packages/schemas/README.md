# packages/schemas

Shared Zod schemas used by the app and Edge Functions. Owner: TB-24 (AI output schemas).

Files import only `zod`, so they run under Node (app, Jest) and Deno (Edge Functions map `zod` in their `deno.json`). Edge Functions import them by relative path with the `.ts` extension.

| File | Contents | Ticket |
|---|---|---|
| `src/ai-gateway.ts` | AI gateway request, success and error envelopes; route names; error codes (`QUOTA_EXCEEDED` added by TB-23) | [TB-22](https://stratyge.atlassian.net/browse/TB-22), [TB-23](https://stratyge.atlassian.net/browse/TB-23) |
| `src/delete-account.ts` | Account deletion request (`{ confirm: "DELETE" }`), success (`deleted` / `already_deleted`) and error envelopes | [TB-53](https://stratyge.atlassian.net/browse/TB-53) |
| `src/planning.ts` | Planning constraints: work hours (`HH:MM`, 15-minute steps, end after start) and daily capacity (minutes, at most the work-hours span); defaults 09:00–17:00 / 6 h. Read by the app planner accessor (`src/features/plan`) and, later, the `/plan` request | [TB-33](https://stratyge.atlassian.net/browse/TB-33) |
