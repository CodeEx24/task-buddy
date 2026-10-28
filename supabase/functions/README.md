# supabase/functions

Edge Functions (ai-gateway, send-checkins, revenuecat-webhook). Server-only: never import from src/. Owner: TB-19 / TB-22.

- [`ai-gateway/`](ai-gateway/README.md) (TB-22): JWT-verified AI gateway with a middleware pipeline for rate limits (TB-23), output validation (TB-24) and input hardening (TB-25).
- Code is runtime-agnostic where possible (web-standard `Request`/`Response`) so Jest can test it (`pnpm test --selectProjects edge-functions`). Only `index.ts` touches `Deno`.
- Relative imports use the `.ts` extension (Deno requires it; `tsconfig.json` allows it). npm packages are mapped in each function's `deno.json`.
