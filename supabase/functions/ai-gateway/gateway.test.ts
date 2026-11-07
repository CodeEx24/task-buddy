// TB-22 gateway handler tests: fake provider + fake auth verifier, no network.
import {
  aiGatewayErrorSchema,
  aiGatewaySuccessSchema,
} from '../../../packages/schemas/src/ai-gateway.ts';

import type { AuthVerifier } from './auth.ts';
import { AI_TIMEOUT_MS, DEFAULT_MODELS, loadGatewayConfig } from './config.ts';
import {
  createGateway,
  type GatewayDeps,
  type GatewayLogEntry,
  MAX_BODY_BYTES,
  resolveRoute,
} from './gateway.ts';
import type { GatewayMiddleware } from './pipeline.ts';
import {
  type AiProvider,
  ProviderError,
  type ProviderRequest,
  type ProviderResult,
} from './providers/provider.ts';

const BASE = 'http://127.0.0.1:54321/functions/v1/ai-gateway';
const VALID_TOKEN = 'valid-user-token';
const USER_ID = '0199e8c4-0000-7000-8000-000000000001';

type Call = { request: ProviderRequest; signal: AbortSignal };

function fakeProvider(
  impl?: (request: ProviderRequest, signal: AbortSignal) => Promise<ProviderResult>,
) {
  const calls: Call[] = [];
  const provider: AiProvider = {
    name: 'fake',
    complete(request, signal) {
      calls.push({ request, signal });
      if (impl) return impl(request, signal);
      return Promise.resolve({
        text: `echo:${request.input}`,
        model: request.model,
        usage: { inputTokens: 3, outputTokens: 5 },
      });
    },
  };
  return { provider, calls };
}

const fakeAuth: AuthVerifier = {
  verify: (token) => Promise.resolve(token === VALID_TOKEN ? { id: USER_ID } : null),
};

function setup(overrides: Partial<GatewayDeps> = {}) {
  const fake = fakeProvider();
  const logs: GatewayLogEntry[] = [];
  const handler = createGateway({
    config: loadGatewayConfig(() => undefined),
    auth: fakeAuth,
    provider: fake.provider,
    middleware: [],
    log: (entry) => logs.push(entry),
    newRequestId: () => 'req-1',
    ...overrides,
  });
  return { handler, calls: fake.calls, logs };
}

function post(route: string, init: { token?: string | null; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = init.token === undefined ? VALID_TOKEN : init.token;
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request(`${BASE}/${route}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(init.body ?? { input: 'buy milk tomorrow' }),
  });
}

async function errorCode(response: Response): Promise<string> {
  return aiGatewayErrorSchema.parse(await response.json()).error.code;
}

describe('AC1: unauthenticated requests get 401 and never reach the provider', () => {
  it.each([
    ['no Authorization header', null],
    ['an unknown token', 'garbage'],
    ['an empty bearer', ''],
  ])('%s → 401', async (_label, token) => {
    const { handler, calls } = setup();
    const response = await handler(post('parse', { token }));
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('UNAUTHENTICATED');
    expect(response.headers.get('WWW-Authenticate')).toContain('Bearer');
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-Bearer scheme without asking the verifier', async () => {
    const verify = jest.fn(fakeAuth.verify);
    const { handler, calls } = setup({ auth: { verify } });
    const request = new Request(`${BASE}/plan`, {
      method: 'POST',
      headers: { Authorization: `Basic ${VALID_TOKEN}` },
      body: '{}',
    });
    expect((await handler(request)).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('checks auth before the body, and before registered middleware', async () => {
    const guard: GatewayMiddleware = { name: 'spy', handle: jest.fn((_ctx, next) => next()) };
    const { handler, calls } = setup({ middleware: [guard] });
    const response = await handler(post('breakdown', { token: 'garbage', body: { nope: 1 } }));
    expect(response.status).toBe(401);
    expect(guard.handle).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('returns 401 (not AI_NOT_CONFIGURED) when the provider key is missing and the caller is anonymous', async () => {
    const { handler } = setup({ provider: null });
    expect((await handler(post('parse', { token: null }))).status).toBe(401);
  });
});

describe('AC2: each route uses its configured model and a 20-second timeout', () => {
  it.each([
    ['parse', DEFAULT_MODELS.cheap],
    ['breakdown', DEFAULT_MODELS.strong],
    ['plan', DEFAULT_MODELS.strong],
  ])('/%s → %s, 200 with the provider output', async (route, model) => {
    const { handler, calls, logs } = setup();
    const response = await handler(post(route));
    expect(response.status).toBe(200);
    const body = aiGatewaySuccessSchema.parse(await response.json());
    expect(body).toEqual({
      requestId: 'req-1',
      route,
      model,
      output: 'echo:buy milk tomorrow',
      usage: { inputTokens: 3, outputTokens: 5 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.model).toBe(model);
    expect(calls[0]?.request.input).toBe('buy milk tomorrow');
    expect(calls[0]?.signal.aborted).toBe(false);
    expect(response.headers.get('X-Request-Id')).toBe('req-1');
    expect(logs).toEqual([
      expect.objectContaining({ requestId: 'req-1', route, status: 200, model }),
    ]);
  });

  it('reads model ids from env (AI_MODEL_CHEAP / AI_MODEL_STRONG)', async () => {
    const env: Record<string, string> = { AI_MODEL_CHEAP: 'cheap-x', AI_MODEL_STRONG: 'strong-y' };
    const { handler, calls } = setup({ config: loadGatewayConfig((name) => env[name]) });
    await handler(post('parse'));
    await handler(post('plan'));
    expect(calls.map((c) => c.request.model)).toEqual(['cheap-x', 'strong-y']);
  });

  it('every route is configured with a 20 000 ms timeout', () => {
    const { routes } = loadGatewayConfig(() => undefined);
    expect(AI_TIMEOUT_MS).toBe(20_000);
    expect(Object.values(routes).map((r) => r.timeoutMs)).toEqual([20_000, 20_000, 20_000]);
  });

  describe('timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('aborts the provider at 20 s and returns 504 AI_TIMEOUT', async () => {
      const hang = (_r: ProviderRequest, signal: AbortSignal) =>
        new Promise<ProviderResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      const fake = fakeProvider(hang);
      const { handler } = setup({ provider: fake.provider });
      const pending = handler(post('plan'));
      await jest.advanceTimersByTimeAsync(AI_TIMEOUT_MS - 1);
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.signal.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(fake.calls[0]?.signal.aborted).toBe(true);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await errorCode(response)).toBe('AI_TIMEOUT');
    });

    it('still returns 504 at 20 s when a provider ignores the abort signal', async () => {
      const fake = fakeProvider(() => new Promise<ProviderResult>(() => {}));
      const { handler } = setup({ provider: fake.provider });
      let settled = false;
      const pending = handler(post('breakdown')).then((response) => {
        settled = true;
        return response;
      });
      await jest.advanceTimersByTimeAsync(AI_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await errorCode(response)).toBe('AI_TIMEOUT');
    });

    it('clears the timer when the provider answers in time', async () => {
      const { handler, calls } = setup();
      expect((await handler(post('parse'))).status).toBe(200);
      await jest.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
      expect(calls[0]?.signal.aborted).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});

describe('error mapping', () => {
  it('provider failure → 502 AI_PROVIDER_ERROR without upstream detail', async () => {
    const fake = fakeProvider(() =>
      Promise.reject(new ProviderError('upstream', 'secret upstream detail', 529)),
    );
    const { handler } = setup({ provider: fake.provider });
    const response = await handler(post('parse'));
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe('AI_PROVIDER_ERROR');
    expect(text).not.toContain('secret upstream detail');
  });

  it('unexpected exception → 500 INTERNAL', async () => {
    const fake = fakeProvider(() => Promise.reject(new TypeError('boom')));
    const { handler } = setup({ provider: fake.provider });
    const response = await handler(post('parse'));
    expect(response.status).toBe(500);
    expect(await errorCode(response)).toBe('INTERNAL');
  });

  it('missing provider key → 500 AI_NOT_CONFIGURED for a signed-in user', async () => {
    const { handler } = setup({ provider: null });
    const response = await handler(post('parse'));
    expect(response.status).toBe(500);
    expect(await errorCode(response)).toBe('AI_NOT_CONFIGURED');
  });

  it.each([
    ['non-JSON body', 'not json'],
    ['missing input', {}],
    ['empty input', { input: '   ' }],
    ['unknown field', { input: 'x', model: 'claude-opus' }],
    ['oversized input', { input: 'a'.repeat(8001) }],
  ])('%s → 400 BAD_REQUEST, provider not called', async (_label, body) => {
    const { handler, calls } = setup();
    const request = new Request(`${BASE}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    const response = await handler(request);
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('BAD_REQUEST');
    expect(calls).toHaveLength(0);
  });

  it('unknown route → 404, GET → 405, OPTIONS → CORS preflight', async () => {
    const { handler, calls } = setup();
    expect((await handler(post('chat'))).status).toBe(404);
    const get = await handler(new Request(`${BASE}/parse`));
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toContain('POST');
    const options = await handler(new Request(`${BASE}/parse`, { method: 'OPTIONS' }));
    expect(options.status).toBe(200);
    expect(options.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(calls).toHaveLength(0);
  });

  it('never logs user text or tokens', async () => {
    const { handler, logs } = setup();
    await handler(post('parse', { body: { input: 'call my therapist' } }));
    await handler(post('parse', { token: 'garbage' }));
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain('therapist');
    expect(logged).not.toContain(VALID_TOKEN);
    expect(logged).not.toContain('garbage');
    expect(logs[0]?.usage).toEqual({ inputTokens: 3, outputTokens: 5 });
  });
});

describe('middleware pipeline', () => {
  it('runs registered middleware in order around the provider and lets one short-circuit', async () => {
    const order: string[] = [];
    const first: GatewayMiddleware = {
      name: 'first',
      async handle(ctx, next) {
        order.push(`first:${ctx.user.id === USER_ID}`);
        const response = await next();
        order.push('first:after');
        return response;
      },
    };
    const limiter: GatewayMiddleware = {
      name: 'limiter',
      async handle(ctx, next) {
        order.push('limiter');
        if (ctx.body.input === 'blocked') {
          return new Response('{}', { status: 429 });
        }
        return next();
      },
    };
    const { handler, calls } = setup({ middleware: [first, limiter] });

    expect((await handler(post('parse', { body: { input: 'blocked' } }))).status).toBe(429);
    expect(calls).toHaveLength(0);
    expect(order).toEqual(['first:true', 'limiter', 'first:after']);

    order.length = 0;
    expect((await handler(post('parse'))).status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(order).toEqual(['first:true', 'limiter', 'first:after']);
  });

  it('lets a middleware rewrite the body before the provider and read the result after', async () => {
    let seen: string | undefined;
    const rewrite: GatewayMiddleware = {
      name: 'rewrite',
      async handle(ctx, next) {
        ctx.body = { input: ctx.body.input.toUpperCase() };
        const response = await next();
        seen = ctx.result?.text;
        return response;
      },
    };
    const { handler, calls } = setup({ middleware: [rewrite] });
    await handler(post('parse', { body: { input: 'abc' } }));
    expect(calls[0]?.request.input).toBe('ABC');
    expect(seen).toBe('echo:ABC');
  });

  it('lets a middleware retry the provider after the first call settled (TB-24 repair)', async () => {
    const repair: GatewayMiddleware = {
      name: 'repair',
      async handle(ctx, next) {
        const first = await next();
        if (ctx.result?.text.startsWith('echo:bad')) {
          ctx.body = { input: 'fixed' };
          return next();
        }
        return first;
      },
    };
    const { handler, calls, logs } = setup({ middleware: [repair] });
    const response = await handler(post('parse', { body: { input: 'bad' } }));
    expect(response.status).toBe(200);
    expect(aiGatewaySuccessSchema.parse(await response.json()).output).toBe('echo:fixed');
    expect(calls.map((c) => c.request.input)).toEqual(['bad', 'fixed']);
    expect(logs[0]).toMatchObject({
      providerCalls: 2,
      usage: { inputTokens: 6, outputTokens: 10 },
    });
  });

  it('a middleware that calls next() while a call is in flight fails closed with 500', async () => {
    const overlap: GatewayMiddleware = {
      name: 'overlap',
      async handle(_ctx, next) {
        const [a] = await Promise.all([next(), next()]);
        return a;
      },
    };
    const { handler, logs } = setup({ middleware: [overlap] });
    expect((await handler(post('parse'))).status).toBe(500);
    expect(logs[0]).toMatchObject({ errorKind: 'exception', errorName: 'Error' });
  });
});

describe('failure causes in the log line', () => {
  it('records the provider error kind and upstream status, never the message', async () => {
    const fake = fakeProvider(() =>
      Promise.reject(new ProviderError('upstream', 'detail with user text', 401)),
    );
    const { handler, logs } = setup({ provider: fake.provider });
    await handler(post('parse'));
    expect(logs[0]).toMatchObject({ status: 502, errorKind: 'upstream', upstreamStatus: 401 });
    expect(JSON.stringify(logs)).not.toContain('detail with user text');
  });

  it('records a timeout', async () => {
    jest.useFakeTimers();
    try {
      const fake = fakeProvider(() => new Promise<ProviderResult>(() => {}));
      const { handler, logs } = setup({ provider: fake.provider });
      const pending = handler(post('plan'));
      await jest.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
      await pending;
      expect(logs[0]).toMatchObject({ status: 504, errorKind: 'timeout', providerCalls: 1 });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('body size', () => {
  it('rejects a declared body above MAX_BODY_BYTES with 400 before parsing', async () => {
    const { handler, calls } = setup();
    const request = new Request(`${BASE}/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VALID_TOKEN}`,
        'Content-Length': String(MAX_BODY_BYTES + 1),
      },
      body: JSON.stringify({ input: 'x' }),
    });
    const response = await handler(request);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects an undeclared oversized body with 400', async () => {
    const { handler, calls } = setup();
    const request = new Request(`${BASE}/parse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: JSON.stringify({ input: 'x', pad: 'p'.repeat(MAX_BODY_BYTES) }),
    });
    expect((await handler(request)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('resolveRoute', () => {
  it.each([
    ['http://x/functions/v1/ai-gateway/parse', 'parse'],
    ['http://x/ai-gateway/plan', 'plan'],
    ['http://x/ai-gateway/breakdown?debug=1', 'breakdown'],
    ['http://x/functions/v1/ai-gateway', null],
    ['http://x/functions/v1/ai-gateway/parse/extra', null],
    ['http://x/functions/v1/ai-gateway/__proto__', null],
    ['http://x/functions/v1/other/parse', null],
  ])('%s → %s', (url, route) => {
    expect(resolveRoute(url)).toBe(route);
  });
});
