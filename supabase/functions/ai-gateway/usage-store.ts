// Usage store (TB-23, https://stratyge.atlassian.net/browse/TB-23): the gateway's only access to the
// rate-limit counters and the `ai_usage_ledger` table. Both operations are single Postgres functions
// (supabase/migrations/20261028180000_ai_usage_limits.sql), so the check-and-increment is atomic
// under concurrency; nothing here reads a counter and writes it back.
//
// Calls PostgREST RPC with the service-role key (auto-injected as SUPABASE_SERVICE_ROLE_KEY in
// Edge Functions). Only the service role may execute these functions; clients can't.
import type { AiRoute, AiUsage } from '../../../packages/schemas/src/ai-gateway.ts';

import type { UsageLimits } from './config.ts';
import type { ProviderCallOutcome } from './pipeline.ts';

export type UsageDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'rate_limited' | 'quota_exceeded';
      /** Whole seconds until the window resets (next UTC hour or next 00:00 UTC), at least 1. */
      retryAfterSeconds: number;
    };

/** One `ai_usage_ledger` row: one provider call. No user text, prompts or output. */
export type LedgerEntry = {
  userId: string;
  requestId: string;
  route: AiRoute;
  model: string;
  usage: AiUsage;
  costUsd: number;
  outcome: ProviderCallOutcome;
};

export type UsageStore = {
  /** Checks the daily quota, then atomically counts this call against the hourly limit. */
  consume(userId: string, limits: UsageLimits): Promise<UsageDecision>;
  /** Writes the ledger row and adds its tokens to the user's daily total (one transaction). */
  record(entry: LedgerEntry): Promise<void>;
};

/** Thrown on any store failure. Carries no response body (it could echo request data). */
export class UsageStoreError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'UsageStoreError';
    this.status = status;
  }
}

export type SupabaseUsageStoreOptions = {
  supabaseUrl: string;
  /** Service-role key (server-only secret). Never logged. */
  serviceRoleKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type ConsumeRow = {
  allowed: boolean;
  reason: string | null;
  retry_after_seconds: number | null;
};

function isConsumeRow(value: unknown): value is ConsumeRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.allowed === 'boolean' &&
    (row.reason === null || typeof row.reason === 'string') &&
    (row.retry_after_seconds === null || typeof row.retry_after_seconds === 'number')
  );
}

/** Maps the SQL function's row to a decision; anything unexpected is a store error (fail closed). */
export function toDecision(row: unknown): UsageDecision {
  if (!isConsumeRow(row)) throw new UsageStoreError('unexpected consume result');
  if (row.allowed) return { allowed: true };
  if (row.reason !== 'rate_limited' && row.reason !== 'quota_exceeded') {
    throw new UsageStoreError('unexpected consume reason');
  }
  return {
    allowed: false,
    reason: row.reason,
    retryAfterSeconds: Math.max(1, Math.ceil(row.retry_after_seconds ?? 1)),
  };
}

export function createSupabaseUsageStore(options: SupabaseUsageStoreOptions): UsageStore {
  const base = `${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;

  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await doFetch(`${base}/${fn}`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            apikey: options.serviceRoleKey,
            Authorization: `Bearer ${options.serviceRoleKey}`,
          },
          body: JSON.stringify(args),
        });
      } catch {
        throw new UsageStoreError(`${fn} request failed`);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new UsageStoreError(`${fn} returned an error`, response.status);
      }
      if (response.status === 204) return null;
      try {
        return await response.json();
      } catch {
        throw new UsageStoreError(`${fn} body is not JSON`, response.status);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async consume(userId, limits) {
      const rows = await rpc('ai_consume_call', {
        p_user_id: userId,
        p_calls_per_hour: limits.callsPerHour,
        p_tokens_per_day: limits.tokensPerDay,
      });
      return toDecision(Array.isArray(rows) ? rows[0] : rows);
    },
    async record(entry) {
      await rpc('ai_record_usage', {
        p_user_id: entry.userId,
        p_request_id: entry.requestId,
        p_route: entry.route,
        p_model: entry.model,
        p_input_tokens: entry.usage.inputTokens,
        p_output_tokens: entry.usage.outputTokens,
        p_cost_usd: entry.costUsd,
        p_outcome: entry.outcome,
      });
    },
  };
}
