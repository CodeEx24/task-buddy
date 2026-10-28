// TB-23 (https://stratyge.atlassian.net/browse/TB-23): the PostgREST RPC usage store, with a fake fetch.
import { createSupabaseUsageStore, toDecision, UsageStoreError } from './usage-store.ts';

const SERVICE_KEY = 'service-role-key-for-tests';
const LIMITS = { callsPerHour: 30, tokensPerDay: 50_000 };

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const doFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(respond());
  }) as unknown as typeof fetch;
  return { doFetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createSupabaseUsageStore', () => {
  it('consume() calls ai_consume_call with the service role and the limits', async () => {
    const { doFetch, calls } = fakeFetch(() =>
      json(200, [{ allowed: true, reason: null, retry_after_seconds: null }]),
    );
    const store = createSupabaseUsageStore({
      supabaseUrl: 'http://127.0.0.1:54321/',
      serviceRoleKey: SERVICE_KEY,
      fetch: doFetch,
    });
    await expect(store.consume('user-1', LIMITS)).resolves.toEqual({ allowed: true });
    expect(calls[0]?.url).toBe('http://127.0.0.1:54321/rest/v1/rpc/ai_consume_call');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.apikey).toBe(SERVICE_KEY);
    expect(headers.Authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      p_user_id: 'user-1',
      p_calls_per_hour: 30,
      p_tokens_per_day: 50_000,
    });
  });

  it('maps a refusal row to a decision', async () => {
    const { doFetch } = fakeFetch(() =>
      json(200, [{ allowed: false, reason: 'rate_limited', retry_after_seconds: 2700 }]),
    );
    const store = createSupabaseUsageStore({
      supabaseUrl: 'http://x',
      serviceRoleKey: SERVICE_KEY,
      fetch: doFetch,
    });
    await expect(store.consume('u', LIMITS)).resolves.toEqual({
      allowed: false,
      reason: 'rate_limited',
      retryAfterSeconds: 2700,
    });
  });

  it('record() calls ai_record_usage with every ledger field', async () => {
    const { doFetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const store = createSupabaseUsageStore({
      supabaseUrl: 'http://x',
      serviceRoleKey: SERVICE_KEY,
      fetch: doFetch,
    });
    await store.record({
      userId: 'user-1',
      requestId: 'req-1',
      route: 'plan',
      model: 'claude-sonnet-5-5',
      usage: { inputTokens: 10, outputTokens: 20 },
      costUsd: 0.00022,
      outcome: 'ok',
    });
    expect(calls[0]?.url).toBe('http://x/rest/v1/rpc/ai_record_usage');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      p_user_id: 'user-1',
      p_request_id: 'req-1',
      p_route: 'plan',
      p_model: 'claude-sonnet-5-5',
      p_input_tokens: 10,
      p_output_tokens: 20,
      p_cost_usd: 0.00022,
      p_outcome: 'ok',
    });
  });

  it.each([
    ['HTTP error', () => json(401, { message: 'echo of input' }), 401],
    ['network failure', () => Promise.reject(new TypeError('fetch failed')), undefined],
    ['non-JSON body', () => new Response('nope', { status: 200 }), 200],
  ])('throws UsageStoreError on %s, without the body', async (_label, respond, status) => {
    const { doFetch } = fakeFetch(respond);
    const store = createSupabaseUsageStore({
      supabaseUrl: 'http://x',
      serviceRoleKey: SERVICE_KEY,
      fetch: doFetch,
    });
    const error = await store.consume('u', LIMITS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UsageStoreError);
    expect((error as UsageStoreError).status).toBe(status);
    expect((error as Error).message).not.toContain('echo');
    expect((error as Error).message).not.toContain(SERVICE_KEY);
  });

  it('aborts a hung request after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const doFetch = ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch;
      const store = createSupabaseUsageStore({
        supabaseUrl: 'http://x',
        serviceRoleKey: SERVICE_KEY,
        fetch: doFetch,
        timeoutMs: 1000,
      });
      const pending = store.consume('u', LIMITS).catch((e: unknown) => e);
      jest.advanceTimersByTime(1000);
      expect(await pending).toBeInstanceOf(UsageStoreError);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('toDecision', () => {
  it.each([
    [undefined],
    [null],
    [{}],
    [{ allowed: 'yes', reason: null, retry_after_seconds: null }],
    [{ allowed: false, reason: 'other', retry_after_seconds: 5 }],
  ])('fails closed on an unexpected row: %p', (row) => {
    expect(() => toDecision(row)).toThrow(UsageStoreError);
  });

  it('keeps Retry-After at least 1 second', () => {
    expect(
      toDecision({ allowed: false, reason: 'quota_exceeded', retry_after_seconds: 0 }),
    ).toEqual({ allowed: false, reason: 'quota_exceeded', retryAfterSeconds: 1 });
  });
});
