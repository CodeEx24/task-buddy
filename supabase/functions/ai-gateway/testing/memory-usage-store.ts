// Test-only in-memory UsageStore (TB-23, https://stratyge.atlassian.net/browse/TB-23). Mirrors
// ai_consume_call / ai_record_usage in supabase/migrations/20261028180000_ai_usage_limits.sql
// (fixed UTC-hour call window, UTC-day token total, quota checked first) with an injected clock.
// The SQL itself is covered by supabase/tests/database/ai_usage_limits.test.sql.
import type { LedgerEntry, UsageDecision, UsageStore } from '../usage-store.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type MemoryUsageStore = UsageStore & {
  readonly ledger: (LedgerEntry & { createdAt: number })[];
  callsThisHour(userId: string): number;
  tokensToday(userId: string): number;
};

export function createMemoryUsageStore(now: () => number): MemoryUsageStore {
  const hourCalls = new Map<string, number>();
  const dayTokens = new Map<string, number>();
  const ledger: (LedgerEntry & { createdAt: number })[] = [];

  const hourKey = (userId: string, at: number) => `${userId}|${Math.floor(at / HOUR_MS)}`;
  const dayKey = (userId: string, at: number) => `${userId}|${Math.floor(at / DAY_MS)}`;
  const secondsUntil = (boundary: number, at: number) =>
    Math.max(1, Math.ceil((boundary - at) / 1000));

  return {
    ledger,
    callsThisHour: (userId) => hourCalls.get(hourKey(userId, now())) ?? 0,
    tokensToday: (userId) => dayTokens.get(dayKey(userId, now())) ?? 0,
    consume(userId, limits): Promise<UsageDecision> {
      const at = now();
      const tokens = dayTokens.get(dayKey(userId, at)) ?? 0;
      if (tokens >= limits.tokensPerDay) {
        const nextDay = (Math.floor(at / DAY_MS) + 1) * DAY_MS;
        return Promise.resolve({
          allowed: false,
          reason: 'quota_exceeded',
          retryAfterSeconds: secondsUntil(nextDay, at),
        });
      }
      const key = hourKey(userId, at);
      const calls = hourCalls.get(key) ?? 0;
      if (calls >= limits.callsPerHour) {
        const nextHour = (Math.floor(at / HOUR_MS) + 1) * HOUR_MS;
        return Promise.resolve({
          allowed: false,
          reason: 'rate_limited',
          retryAfterSeconds: secondsUntil(nextHour, at),
        });
      }
      hourCalls.set(key, calls + 1);
      return Promise.resolve({ allowed: true });
    },
    record(entry) {
      const at = now();
      ledger.push({ ...entry, createdAt: at });
      const key = dayKey(entry.userId, at);
      dayTokens.set(
        key,
        (dayTokens.get(key) ?? 0) + entry.usage.inputTokens + entry.usage.outputTokens,
      );
      return Promise.resolve();
    },
  };
}
