// TB-23 (https://stratyge.atlassian.net/browse/TB-23): per-user rate limit, daily token quota and
// usage ledger. Request guard: registered first, so it runs right after auth and body validation
// and before every other middleware and the provider.
//
//   before next(): store.consume() — over the daily quota → 429 QUOTA_EXCEEDED, over the hourly
//                  call limit → 429 RATE_LIMITED, both with Retry-After. The provider is not called.
//                  Store unreachable → 500 INTERNAL (fail closed: no unmetered AI calls).
//   after next():  one ledger row per provider call of this request (ctx.providerCalls), including
//                  failed calls (timeouts and unreadable 2xx bodies at an upper-bound token
//                  estimate, see gateway.ts). A ledger write failure is logged (no PII) and never
//                  fails the user's request: the answer has already been paid for.
import { estimateCostUsd, type UsageLimits } from '../config.ts';
import { errorResponse } from '../http.ts';
import type { GatewayContext, GatewayMiddleware } from '../pipeline.ts';
import type { UsageDecision, UsageStore } from '../usage-store.ts';

/** Logged on store failures only. Request id and error class: never user id, text or bodies. */
export type UsageLogEntry = {
  requestId: string;
  event: 'usage_check_failed' | 'usage_record_failed';
  errorName: string;
  status?: number;
};

export type UsageLimitsDeps = {
  store: UsageStore;
  limits: Readonly<UsageLimits>;
  log?: (entry: UsageLogEntry) => void;
};

function describe(error: unknown): Pick<UsageLogEntry, 'errorName' | 'status'> {
  const errorName = error instanceof Error ? error.name : typeof error;
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === 'number' ? { errorName, status } : { errorName };
}

export function createUsageLimits(deps: UsageLimitsDeps): GatewayMiddleware {
  const log = deps.log ?? (() => {});

  async function recordCalls(ctx: GatewayContext, from: number): Promise<void> {
    for (const call of ctx.providerCalls.slice(from)) {
      try {
        await deps.store.record({
          userId: ctx.user.id,
          requestId: ctx.requestId,
          route: ctx.route,
          model: call.model,
          usage: call.usage,
          // Priced by the configured id: the provider may report a dated snapshot id.
          costUsd: estimateCostUsd(call.requestedModel, call.usage),
          outcome: call.outcome,
        });
      } catch (error) {
        log({ requestId: ctx.requestId, event: 'usage_record_failed', ...describe(error) });
      }
    }
  }

  return {
    name: 'usage-limits',
    async handle(ctx, next) {
      let decision: UsageDecision;
      try {
        decision = await deps.store.consume(ctx.user.id, deps.limits);
      } catch (error) {
        log({ requestId: ctx.requestId, event: 'usage_check_failed', ...describe(error) });
        return errorResponse(ctx.requestId, 'INTERNAL');
      }

      if (!decision.allowed) {
        return errorResponse(
          ctx.requestId,
          decision.reason === 'quota_exceeded' ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
          { 'Retry-After': String(decision.retryAfterSeconds) },
        );
      }

      const from = ctx.providerCalls.length;
      try {
        return await next();
      } finally {
        await recordCalls(ctx, from);
      }
    },
  };
}
