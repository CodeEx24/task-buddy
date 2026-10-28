// Registered gateway middleware, run in this order after auth and body validation (TB-22).
// To add a guardrail: create `./<name>.ts` exporting a `GatewayMiddleware` (or a factory taking
// `MiddlewareDeps`), import it here and add one line to the array. See ../pipeline.ts for the
// contract and ../README.md for an example.
//
// TB-23 turned the constant array into `buildMiddleware(deps)` because its guard needs runtime
// dependencies (the usage store and limits, wired from env in ../index.ts). Static middleware is
// still one line: `myGuard,`.
import type { GatewayConfig } from '../config.ts';
import type { GatewayMiddleware } from '../pipeline.ts';
import type { UsageStore } from '../usage-store.ts';

import { outputValidation } from './output-validation.ts';
import { createUsageLimits, type UsageLogEntry } from './usage-limits.ts';

export type MiddlewareDeps = {
  config: GatewayConfig;
  usageStore: UsageStore;
  log?: (entry: UsageLogEntry) => void;
};

export function buildMiddleware(deps: MiddlewareDeps): readonly GatewayMiddleware[] {
  return [
    // TB-23: per-user rate limit, daily token quota and usage ledger (request guard, first)
    createUsageLimits({ store: deps.usageStore, limits: deps.config.limits, log: deps.log }),
    // TB-25: prompt-injection and input hardening (request guard, after TB-23)
    // TB-24: output schema validation and repair retry. Keep it LAST (innermost): TB-23 then
    // wraps the whole request once, and a repair is a second provider call of the same request.
    outputValidation,
  ];
}
