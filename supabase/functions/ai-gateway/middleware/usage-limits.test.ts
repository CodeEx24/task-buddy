// TB-23 (https://stratyge.atlassian.net/browse/TB-23): rate limit, daily quota and ledger, driven
// through the real gateway handler with a fake provider, a fake verifier and an in-memory store
// on an injected clock.
import { aiGatewayErrorSchema } from '../../../../packages/schemas/src/ai-gateway.ts';
import type { AuthVerifier } from '../auth.ts';
import { DEFAULT_MODELS, estimateCostUsd, loadGatewayConfig, ROUTES } from '../config.ts';
import { createGateway } from '../gateway.ts';
import type { GatewayMiddleware } from '../pipeline.ts';
import { type AiProvider, ProviderError, type ProviderResult } from '../providers/provider.ts';
import { createMemoryUsageStore } from '../testing/memory-usage-store.ts';
import { type UsageStore, UsageStoreError } from '../usage-store.ts';

import { buildMiddleware } from './index.ts';
import { createUsageLimits, type UsageLogEntry } from './usage-limits.ts';

const BASE = 'http://127.0.0.1:54321/functions/v1/ai-gateway';
const USER_A = '0199e8c4-0000-7000-8000-00000000000a';
const USER_B = '0199e8c4-0000-7000-8000-00000000000b';
const TOKENS: Record<string, string> = { 'token-a': USER_A, 'token-b': USER_B };
const auth: AuthVerifier = {
  verify: (token) => Promise.resolve(TOKENS[token] ? { id: TOKENS[token] } : null),
};

type ProviderImpl = () => Promise<ProviderResult>;

function setup(
  options: {
    env?: Record<string, string>;
    start?: string;
    store?: UsageStore;
    provider?: ProviderImpl;
    extra?: GatewayMiddleware[];
  } = {},
) {
  let clock = Date.parse(options.start ?? '2026-10-28T10:15:00Z');
  const now = () => clock;
  const memory = createMemoryUsageStore(now);
  const store = options.store ?? memory;
  const config = loadGatewayConfig((name) => options.env?.[name]);
  const providerCalls: string[] = [];
  const provider: AiProvider = {
    name: 'fake',
    complete(request) {
      providerCalls.push(request.model);
      if (options.provider) return options.provider();
      return Promise.resolve({
        text: '{"ok":true}',
        model: request.model,
        usage: { inputTokens: 120, outputTokens: 30 },
      });
    },
  };
  const usageLogs: UsageLogEntry[] = [];
  let id = 0;
  const handler = createGateway({
    config,
    auth,
    provider,
    middleware: [
      ...buildMiddleware({ config, usageStore: store, log: (e) => usageLogs.push(e) }),
      ...(options.extra ?? []),
    ],
    newRequestId: () => `req-${++id}`,
  });
  return {
    handler,
    memory,
    providerCalls,
    usageLogs,
    advanceTo: (iso: string) => {
      clock = Date.parse(iso);
    },
  };
}

function post(route = 'parse', token = 'token-a'): Request {
  return new Request(`${BASE}/${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: 'buy milk tomorrow' }),
  });
}

async function code(response: Response): Promise<string> {
  return aiGatewayErrorSchema.parse(await response.json()).error.code;
}

describe('AC1: a free user gets 429 with Retry-After on the 31st call within an hour', () => {
  it('allows 30 calls, then returns 429 RATE_LIMITED with Retry-After to the next UTC hour', async () => {
    const { handler, providerCalls } = setup();
    for (let call = 1; call <= 30; call += 1) {
      expect((await handler(post())).status).toBe(200);
    }
    const response = await handler(post());
    expect(response.status).toBe(429);
    expect(await code(response)).toBe('RATE_LIMITED');
    // 10:15:00 → 11:00:00 UTC
    expect(response.headers.get('Retry-After')).toBe('2700');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
    expect(response.headers.get('X-Request-Id')).toBe('req-31');
    expect(providerCalls).toHaveLength(30);
  });

  it('checks the limit before the provider: a limited call never reaches it', async () => {
    const { handler, providerCalls } = setup({ env: { AI_CALLS_PER_HOUR: '1' } });
    expect((await handler(post())).status).toBe(200);
    expect((await handler(post('plan'))).status).toBe(429);
    expect(providerCalls).toEqual([DEFAULT_MODELS.cheap]);
  });

  it('runs before the other middleware, so a limited call skips TB-24/TB-25 guards too', async () => {
    const later: GatewayMiddleware = { name: 'later', handle: jest.fn((_ctx, next) => next()) };
    const { handler } = setup({ env: { AI_CALLS_PER_HOUR: '1' }, extra: [later] });
    await handler(post());
    await handler(post());
    expect(later.handle).toHaveBeenCalledTimes(1);
  });

  it('counts per user and resets at the top of the next UTC hour', async () => {
    const { handler, advanceTo } = setup({ env: { AI_CALLS_PER_HOUR: '2' } });
    await handler(post());
    await handler(post());
    expect((await handler(post())).status).toBe(429);
    expect((await handler(post('parse', 'token-b'))).status).toBe(200);
    advanceTo('2026-10-28T10:59:59Z');
    const late = await handler(post());
    expect(late.status).toBe(429);
    expect(late.headers.get('Retry-After')).toBe('1');
    advanceTo('2026-10-28T11:00:00Z');
    expect((await handler(post())).status).toBe(200);
  });

  it('uses a fixed 30 calls/hour default when no env override is set', () => {
    expect(loadGatewayConfig(() => undefined).limits.callsPerHour).toBe(30);
  });
});

describe('AC2: every AI call writes a ledger row', () => {
  it('records user, route, model, input/output tokens and the cost estimate', async () => {
    const { handler, memory } = setup();
    await handler(post('parse'));
    await handler(post('plan', 'token-b'));
    expect(memory.ledger).toEqual([
      {
        userId: USER_A,
        requestId: 'req-1',
        route: 'parse',
        model: DEFAULT_MODELS.cheap,
        usage: { inputTokens: 120, outputTokens: 30 },
        costUsd: estimateCostUsd(DEFAULT_MODELS.cheap, { inputTokens: 120, outputTokens: 30 }),
        outcome: 'ok',
        createdAt: Date.parse('2026-10-28T10:15:00Z'),
      },
      expect.objectContaining({
        userId: USER_B,
        requestId: 'req-2',
        route: 'plan',
        model: DEFAULT_MODELS.strong,
        outcome: 'ok',
      }),
    ]);
    expect(memory.ledger[0]?.costUsd).toBeGreaterThan(0);
  });

  it.each([
    [
      'upstream error',
      () => Promise.reject(new ProviderError('upstream', 'x', 529)),
      'upstream',
      502,
    ],
    ['unexpected throw', () => Promise.reject(new TypeError('boom')), 'exception', 500],
  ] as const)(
    'records a failed call (%s) with zero tokens and the outcome',
    async (_label, impl, outcome, status) => {
      const { handler, memory } = setup({ provider: impl });
      expect((await handler(post('breakdown'))).status).toBe(status);
      expect(memory.ledger).toEqual([
        expect.objectContaining({
          route: 'breakdown',
          model: DEFAULT_MODELS.strong,
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 0,
          outcome,
        }),
      ]);
    },
  );

  it.each([
    [
      'timeout',
      () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      504,
    ],
    ['bad_response', () => Promise.reject(new ProviderError('bad_response', 'x')), 502],
  ] as const)(
    'records a possibly-billed failure (%s) at an upper-bound token estimate',
    async (outcome, impl, status) => {
      const { handler, memory } = setup({ provider: impl });
      expect((await handler(post('plan'))).status).toBe(status);
      const plan = ROUTES.plan;
      const usage = {
        // whole prompt at 3 chars/token, plus the route's full max_tokens
        inputTokens: Math.ceil((plan.system.length + 'buy milk tomorrow'.length) / 3),
        outputTokens: plan.maxTokens,
      };
      expect(memory.ledger).toEqual([
        expect.objectContaining({
          route: 'plan',
          model: DEFAULT_MODELS.strong,
          usage,
          costUsd: estimateCostUsd(DEFAULT_MODELS.strong, usage),
          outcome,
        }),
      ]);
      // ...and those tokens count against the daily quota.
      expect(memory.tokensToday(USER_A)).toBe(usage.inputTokens + usage.outputTokens);
      expect(memory.ledger[0]?.costUsd).toBeGreaterThan(0);
    },
  );

  it('prices by the configured model when the provider reports a dated snapshot id', async () => {
    const { handler, memory } = setup({
      provider: () =>
        Promise.resolve({
          text: 'x',
          model: `${DEFAULT_MODELS.cheap}-20261001`,
          usage: { inputTokens: 1_000_000, outputTokens: 0 },
        }),
    });
    await handler(post('parse'));
    expect(memory.ledger[0]?.model).toBe(`${DEFAULT_MODELS.cheap}-20261001`);
    expect(memory.ledger[0]?.costUsd).toBe(0.1); // Haiku 5.5 input price, not the fallback
  });

  it('writes nothing for a rate-limited call (no provider call was made)', async () => {
    const { handler, memory } = setup({ env: { AI_CALLS_PER_HOUR: '1' } });
    await handler(post());
    await handler(post());
    expect(memory.ledger).toHaveLength(1);
  });

  it('writes one row per provider call when a later middleware retries (TB-24 repair)', async () => {
    const retry: GatewayMiddleware = {
      name: 'retry',
      async handle(_ctx, next) {
        await next();
        return next();
      },
    };
    const { handler, memory } = setup({ extra: [retry] });
    expect((await handler(post())).status).toBe(200);
    expect(memory.ledger.map((row) => row.requestId)).toEqual(['req-1', 'req-1']);
    expect(memory.tokensToday(USER_A)).toBe(300);
  });

  it('a ledger write failure is logged without PII and does not fail the request', async () => {
    const memory = createMemoryUsageStore(() => Date.parse('2026-10-28T10:15:00Z'));
    const store: UsageStore = {
      consume: (userId, limits) => memory.consume(userId, limits),
      record: () => Promise.reject(new UsageStoreError('ai_record_usage returned an error', 503)),
    };
    const { handler, usageLogs } = setup({ store });
    const response = await handler(post());
    expect(response.status).toBe(200);
    expect(usageLogs).toEqual([
      {
        requestId: 'req-1',
        event: 'usage_record_failed',
        errorName: 'UsageStoreError',
        status: 503,
      },
    ]);
    const logged = JSON.stringify(usageLogs);
    expect(logged).not.toContain(USER_A);
    expect(logged).not.toContain('milk');
  });
});

describe('AC3: a daily token quota per user, reset at 00:00 UTC', () => {
  it('returns 429 QUOTA_EXCEEDED (distinct code) with Retry-After to 00:00 UTC', async () => {
    // 150 tokens per call; quota 300 → two calls use it up.
    const { handler, providerCalls } = setup({
      env: { AI_TOKENS_PER_DAY: '300' },
      start: '2026-10-28T23:30:00Z',
    });
    expect((await handler(post())).status).toBe(200);
    expect((await handler(post())).status).toBe(200);
    const response = await handler(post());
    expect(response.status).toBe(429);
    expect(await code(response)).toBe('QUOTA_EXCEEDED');
    expect(response.headers.get('Retry-After')).toBe('1800');
    expect(providerCalls).toHaveLength(2);
  });

  it('resets at 00:00 UTC, not on a rolling 24 hours', async () => {
    const { handler, advanceTo } = setup({
      env: { AI_TOKENS_PER_DAY: '150' },
      start: '2026-10-28T23:59:00Z',
    });
    expect((await handler(post())).status).toBe(200);
    advanceTo('2026-10-28T23:59:59Z');
    expect((await handler(post())).status).toBe(429);
    advanceTo('2026-10-29T00:00:00Z');
    expect((await handler(post())).status).toBe(200);
  });

  it('is per user', async () => {
    const { handler } = setup({ env: { AI_TOKENS_PER_DAY: '150' } });
    await handler(post());
    expect((await handler(post())).status).toBe(429);
    expect((await handler(post('parse', 'token-b'))).status).toBe(200);
  });

  it('a quota refusal does not use up an hourly call', async () => {
    const { handler, memory } = setup({ env: { AI_TOKENS_PER_DAY: '150' } });
    await handler(post());
    await handler(post());
    expect(memory.callsThisHour(USER_A)).toBe(1);
  });
});

describe('store failures', () => {
  it('fails closed: the limit check failing returns 500 and never calls the provider', async () => {
    const store: UsageStore = {
      consume: () => Promise.reject(new UsageStoreError('ai_consume_call request failed')),
      record: () => Promise.resolve(),
    };
    const { handler, providerCalls, usageLogs } = setup({ store });
    const response = await handler(post());
    expect(response.status).toBe(500);
    expect(await code(response)).toBe('INTERNAL');
    expect(providerCalls).toHaveLength(0);
    expect(usageLogs).toEqual([
      { requestId: 'req-1', event: 'usage_check_failed', errorName: 'UsageStoreError' },
    ]);
  });

  it('createUsageLimits works without a logger', async () => {
    const store: UsageStore = {
      consume: () => Promise.resolve({ allowed: true }),
      record: () => Promise.reject(new Error('down')),
    };
    const guard = createUsageLimits({ store, limits: { callsPerHour: 1, tokensPerDay: 1 } });
    const handler = createGateway({
      config: loadGatewayConfig(() => undefined),
      auth,
      provider: {
        name: 'fake',
        complete: (r) =>
          Promise.resolve({
            text: 'x',
            model: r.model,
            usage: { inputTokens: 1, outputTokens: 1 },
          }),
      },
      middleware: [guard],
    });
    expect((await handler(post())).status).toBe(200);
  });
});
