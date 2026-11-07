// AI gateway request handler (TB-22, https://stratyge.atlassian.net/browse/TB-22).
// Runtime-agnostic (web-standard Request/Response only): index.ts wires it to Deno.serve, and the
// Jest suite drives it directly with a fake provider and a fake auth verifier.
import type { z } from 'zod';

import {
  AI_ROUTES,
  type AiGatewaySuccess,
  type AiRoute,
  type AiUsage,
  aiGatewayRequestSchema,
} from '../../../packages/schemas/src/ai-gateway.ts';

import { type AuthVerifier, bearerToken } from './auth.ts';
import { type GatewayConfig, modelForRoute } from './config.ts';
import { CORS_HEADERS, errorResponse, jsonResponse } from './http.ts';
import {
  type GatewayContext,
  type GatewayMiddleware,
  type ProviderCallOutcome,
  runPipeline,
} from './pipeline.ts';
import { type AiProvider, ProviderError } from './providers/provider.ts';

export const FUNCTION_NAME = 'ai-gateway';

/** One structured line per request. Never contains user text, tokens or provider bodies. */
export type GatewayLogEntry = {
  requestId: string;
  route: AiRoute | null;
  status: number;
  model?: string;
  durationMs: number;
  /** Summed over every provider call of the request (a TB-24 repair retry makes two). */
  usage?: { inputTokens: number; outputTokens: number };
  providerCalls?: number;
  /** Why a request failed after auth: class names and statuses only, never messages or bodies. */
  errorKind?: 'timeout' | 'upstream' | 'bad_response' | 'exception';
  upstreamStatus?: number;
  errorName?: string;
};

type Trace = Pick<
  GatewayLogEntry,
  'usage' | 'providerCalls' | 'errorKind' | 'upstreamStatus' | 'errorName'
>;

const NO_USAGE = Object.freeze({ inputTokens: 0, outputTokens: 0 });

/** Conservative characters per token for the upper-bound estimate (real text averages ~4). */
const CHARS_PER_TOKEN_LOWER_BOUND = 3;

/**
 * Upper-bound usage for a call that may have been billed without reporting usage (timeout, or a
 * 2xx body we couldn't read): the whole prompt plus the route's full `max_tokens`. Over-counting
 * keeps the daily quota and the cost estimate on the safe side (TB-23).
 */
export function estimateUsageUpperBound(ctx: GatewayContext): AiUsage {
  const promptChars = ctx.routeConfig.system.length + ctx.body.input.length;
  return {
    inputTokens: Math.ceil(promptChars / CHARS_PER_TOKEN_LOWER_BOUND),
    outputTokens: ctx.routeConfig.maxTokens,
  };
}

/** Bodies above this are rejected before parsing; the input itself is capped by the schema. */
export const MAX_BODY_BYTES = 64 * 1024;

export type GatewayDeps = {
  config: GatewayConfig;
  auth: AuthVerifier;
  /** Null when ANTHROPIC_API_KEY is not set: authenticated calls then get AI_NOT_CONFIGURED. */
  provider: AiProvider | null;
  middleware: readonly GatewayMiddleware[];
  log?: (entry: GatewayLogEntry) => void;
  newRequestId?: () => string;
  now?: () => number;
};

/** Extracts the route from `/ai-gateway/<route>` (local and hosted paths both end that way). */
export function resolveRoute(url: string): AiRoute | null {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const at = segments.lastIndexOf(FUNCTION_NAME);
  if (at === -1 || segments.length !== at + 2) return null;
  const candidate = segments[at + 1];
  return (AI_ROUTES as readonly string[]).includes(candidate ?? '') ? (candidate as AiRoute) : null;
}

/** The 200 response for `ctx.result`. Exported so output middleware (TB-24) can rebuild it. */
export function successResponse(ctx: GatewayContext): Response {
  if (!ctx.result) throw new Error('successResponse called before the provider stage');
  const body: AiGatewaySuccess = {
    requestId: ctx.requestId,
    route: ctx.route,
    model: ctx.result.model,
    output: ctx.result.text,
    usage: ctx.result.usage,
  };
  return jsonResponse(200, body);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/** Adds X-Request-Id, copying the response if a middleware returned one with immutable headers. */
function withRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set('X-Request-Id', requestId);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set('X-Request-Id', requestId);
    return copy;
  }
}

/** Marks a body over MAX_BODY_BYTES (TB-25: answered with 413, not 400). */
const BODY_TOO_LARGE = Symbol('body too large');

/** Parsed JSON body, BODY_TOO_LARGE, or undefined when it is missing or not JSON. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) return BODY_TOO_LARGE;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return BODY_TOO_LARGE;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** True when the only reason the body failed is an `input` over the schema's transport cap. */
function isInputTooLong(error: z.ZodError): boolean {
  return error.issues.some((issue) => issue.code === 'too_big' && issue.path[0] === 'input');
}

export function createGateway(deps: GatewayDeps): (request: Request) => Promise<Response> {
  const log = deps.log ?? (() => {});
  const newRequestId = deps.newRequestId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => Date.now());

  /** Stage 5: one provider call with the route's model, aborted after the route timeout. */
  async function callProvider(
    ctx: GatewayContext,
    provider: AiProvider,
    trace: Trace,
  ): Promise<Response> {
    trace.providerCalls = (trace.providerCalls ?? 0) + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.routeConfig.timeoutMs);
    // Settles at the deadline even if a provider ignores the signal.
    const deadline = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('AI timeout')), {
        once: true,
      });
    });
    try {
      ctx.result = await Promise.race([
        provider.complete(
          {
            model: ctx.model,
            system: ctx.routeConfig.system,
            input: ctx.body.input,
            maxTokens: ctx.routeConfig.maxTokens,
          },
          controller.signal,
        ),
        deadline,
      ]);
      trace.usage = {
        inputTokens: (trace.usage?.inputTokens ?? 0) + ctx.result.usage.inputTokens,
        outputTokens: (trace.usage?.outputTokens ?? 0) + ctx.result.usage.outputTokens,
      };
      ctx.providerCalls.push({
        model: ctx.result.model,
        requestedModel: ctx.model,
        usage: ctx.result.usage,
        usageEstimated: false,
        outcome: 'ok',
      });
      return successResponse(ctx);
    } catch (error) {
      // A failed call still gets a ledger entry (TB-23). Calls that may have been billed without
      // reporting usage (timeout, unreadable 2xx body) are counted at an upper-bound estimate.
      const failed = (outcome: ProviderCallOutcome) => {
        const mayBeBilled = outcome === 'timeout' || outcome === 'bad_response';
        ctx.providerCalls.push({
          model: ctx.model,
          requestedModel: ctx.model,
          usage: mayBeBilled ? estimateUsageUpperBound(ctx) : NO_USAGE,
          usageEstimated: mayBeBilled,
          outcome,
        });
      };
      if (controller.signal.aborted || isAbortError(error)) {
        trace.errorKind = 'timeout';
        failed('timeout');
        return errorResponse(ctx.requestId, 'AI_TIMEOUT');
      }
      if (error instanceof ProviderError) {
        trace.errorKind = error.kind;
        if (error.status !== undefined) trace.upstreamStatus = error.status;
        failed(error.kind);
        return errorResponse(ctx.requestId, 'AI_PROVIDER_ERROR');
      }
      failed('exception');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function handle(request: Request, requestId: string, trace: Trace): Promise<Response> {
    // Stage 1: method and route.
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    const route = resolveRoute(request.url);
    if (!route) return errorResponse(requestId, 'NOT_FOUND');
    if (request.method !== 'POST') {
      return errorResponse(requestId, 'METHOD_NOT_ALLOWED', { Allow: 'POST, OPTIONS' });
    }

    // Stage 2: auth. Nothing below runs (least of all the provider) without a verified user.
    const token = bearerToken(request.headers.get('Authorization'));
    const user = token ? await deps.auth.verify(token) : null;
    if (!user) {
      return errorResponse(requestId, 'UNAUTHENTICATED', {
        'WWW-Authenticate': 'Bearer realm="ai-gateway"',
      });
    }

    // Stage 3: body. Oversized text is 413 INPUT_TOO_LONG (TB-25); the 2,000-code-point limit
    // itself is checked after sanitising, in middleware/input-hardening.ts.
    const json = await readJson(request);
    if (json === BODY_TOO_LARGE) return errorResponse(requestId, 'INPUT_TOO_LONG');
    const parsed = aiGatewayRequestSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse(
        requestId,
        isInputTooLong(parsed.error) ? 'INPUT_TOO_LONG' : 'BAD_REQUEST',
      );
    }

    const provider = deps.provider;
    if (!provider) return errorResponse(requestId, 'AI_NOT_CONFIGURED');

    const routeConfig = deps.config.routes[route];
    const ctx: GatewayContext = {
      requestId,
      request,
      route,
      routeConfig,
      model: modelForRoute(deps.config, route),
      user,
      body: parsed.data,
      providerCalls: [],
    };

    // Stages 4–5: registered middleware around the provider call.
    return runPipeline(deps.middleware, ctx, (inner) => callProvider(inner, provider, trace));
  }

  return async (request) => {
    const requestId = newRequestId();
    const started = now();
    const route = resolveRoute(request.url);
    const trace: Trace = {};
    let response: Response;
    try {
      response = await handle(request, requestId, trace);
    } catch (error) {
      trace.errorKind = 'exception';
      trace.errorName = error instanceof Error ? error.name : typeof error;
      response = errorResponse(requestId, 'INTERNAL');
    }
    log({
      requestId,
      route,
      status: response.status,
      durationMs: now() - started,
      ...(route ? { model: modelForRoute(deps.config, route) } : {}),
      ...trace,
    });
    return withRequestId(response, requestId);
  };
}
