// Registered gateway middleware, run in this order after auth and body validation (TB-22).
// To add a guardrail: create `./<name>.ts` exporting a `GatewayMiddleware`, import it here and add
// one line to the array. See ../pipeline.ts for the contract and ../README.md for an example.
import type { GatewayMiddleware } from '../pipeline.ts';

export const MIDDLEWARE: readonly GatewayMiddleware[] = [
  // TB-23: per-user rate limit and token quota (request guard, before the provider)
  // TB-25: prompt-injection and input hardening (request guard, after TB-23)
  // TB-24: output schema validation and repair retry (wraps the provider result)
];
