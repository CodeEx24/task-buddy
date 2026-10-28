// Middleware-pipeline contract (TB-22). Later guardrail tickets plug in here:
// each adds one file under ./middleware/ and one line in ./middleware/index.ts.
//
// Fixed order of a request:
//   1. method + route resolution   (405 / 404)                  gateway.ts
//   2. JWT auth                    (401, provider never called)  gateway.ts, always first
//   3. body validation             (400)                         gateway.ts
//   4. registered middleware, in array order                     middleware/index.ts
//        TB-23 rate limits / quotas, TB-25 input hardening (before `next()`),
//        TB-24 output validation + repair (after `next()`, on `ctx.result`)
//   5. provider call with the route's model and 20 s timeout     gateway.ts
//
// A middleware either returns its own Response (short-circuit, e.g. 429) or awaits `next()`.
// It may call `next()` again after the previous call settled (TB-24 repair retry: replace
// `ctx.body`, call `next()` once more). Each call is a fresh provider call with its own 20 s
// timeout; token usage is summed across calls for logging and quotas. Overlapping calls fail.
import type { AiGatewayRequest, AiRoute } from '../../../packages/schemas/src/ai-gateway.ts';

import type { AuthUser } from './auth.ts';
import type { RouteConfig } from './config.ts';
import type { ProviderResult } from './providers/provider.ts';

export type GatewayContext = {
  readonly requestId: string;
  readonly request: Request;
  readonly route: AiRoute;
  readonly routeConfig: RouteConfig;
  /** Model id resolved for this route (from config/env). */
  readonly model: string;
  /** Verified caller. Always set: middleware runs only after auth succeeded. */
  readonly user: AuthUser;
  /** Validated body. A middleware may replace it (TB-25 sanitising) before calling `next()`. */
  body: AiGatewayRequest;
  /** Set by the provider stage; middleware may read or replace it after `next()` (TB-24). */
  result?: ProviderResult;
};

export type Next = () => Promise<Response>;

export type GatewayMiddleware = {
  /** Short stable name, used in logs. */
  readonly name: string;
  handle(ctx: GatewayContext, next: Next): Promise<Response>;
};

/**
 * Runs `middleware` in order around `terminal` (onion model). `next()` may be called again only
 * after the previous call settled; an overlapping call rejects (the request then fails with 500).
 */
export function runPipeline(
  middleware: readonly GatewayMiddleware[],
  ctx: GatewayContext,
  terminal: (ctx: GatewayContext) => Promise<Response>,
): Promise<Response> {
  const dispatch = (index: number): Promise<Response> => {
    const current = middleware[index];
    if (!current) return terminal(ctx);
    let inFlight = false;
    return current.handle(ctx, async () => {
      if (inFlight) throw new Error(`${current.name} called next() while a call was in flight`);
      inFlight = true;
      try {
        return await dispatch(index + 1);
      } finally {
        inFlight = false;
      }
    });
  };
  return dispatch(0);
}
