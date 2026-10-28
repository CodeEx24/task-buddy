// Gateway configuration (TB-22): model ids, timeouts and per-route settings in one place.
// Model ids come from Edge Function env (AI_MODEL_CHEAP / AI_MODEL_STRONG) with these defaults,
// so a model upgrade is a `supabase secrets set`, not a code change.
import type { AiRoute } from '../../../packages/schemas/src/ai-gateway.ts';

import { PROMPTS, type PromptTemplate } from './prompts/index.ts';

export type ModelTier = 'cheap' | 'strong';

export const DEFAULT_MODELS: Readonly<Record<ModelTier, string>> = {
  cheap: 'claude-haiku-5-5',
  strong: 'claude-sonnet-5-5',
};

/** AC2: every route gives up on the provider after 20 seconds. */
export const AI_TIMEOUT_MS = 20_000;

export type RouteConfig = {
  route: AiRoute;
  tier: ModelTier;
  timeoutMs: number;
  maxTokens: number;
  /** Versioned prompt template (TB-24, `prompts/`). Its version is logged with every request. */
  prompt: PromptTemplate;
  /** `prompt.system`, kept as its own field for the provider stage. */
  system: string;
};

/**
 * Time zone for the reference date that relative phrases ("bukas", "next Monday") resolve against
 * (TB-24). The app targets the Philippines; TB-30 replaces this with the client's own local date.
 */
export const REFERENCE_TIME_ZONE = 'Asia/Manila';

export const ROUTES: Readonly<Record<AiRoute, RouteConfig>> = {
  parse: {
    route: 'parse',
    tier: 'cheap',
    timeoutMs: AI_TIMEOUT_MS,
    // TB-24: 2048 (was 1024) so a 25-task answer is never cut off mid-JSON.
    maxTokens: 2048,
    prompt: PROMPTS.parse,
    system: PROMPTS.parse.system,
  },
  breakdown: {
    route: 'breakdown',
    tier: 'strong',
    timeoutMs: AI_TIMEOUT_MS,
    maxTokens: 2048,
    prompt: PROMPTS.breakdown,
    system: PROMPTS.breakdown.system,
  },
  plan: {
    route: 'plan',
    tier: 'strong',
    timeoutMs: AI_TIMEOUT_MS,
    maxTokens: 4096,
    prompt: PROMPTS.plan,
    system: PROMPTS.plan.system,
  },
};

export type GatewayConfig = {
  models: Readonly<Record<ModelTier, string>>;
  routes: Readonly<Record<AiRoute, RouteConfig>>;
};

export type EnvReader = (name: string) => string | undefined;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadGatewayConfig(env: EnvReader): GatewayConfig {
  return {
    models: {
      cheap: nonEmpty(env('AI_MODEL_CHEAP')) ?? DEFAULT_MODELS.cheap,
      strong: nonEmpty(env('AI_MODEL_STRONG')) ?? DEFAULT_MODELS.strong,
    },
    routes: ROUTES,
  };
}

export function modelForRoute(config: GatewayConfig, route: AiRoute): string {
  return config.models[config.routes[route].tier];
}
