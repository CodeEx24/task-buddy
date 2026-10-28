// AI gateway wire contract (TB-22, https://stratyge.atlassian.net/browse/TB-22).
// Shared by the app's gateway client and `supabase/functions/ai-gateway`. Runtime-agnostic:
// imports only `zod`, which Node resolves from node_modules and Deno through the function's deno.json.
import { z } from 'zod';

/** Gateway routes. The URL is `<SUPABASE_URL>/functions/v1/ai-gateway/<route>`. */
export const AI_ROUTES = ['parse', 'breakdown', 'plan'] as const;
export type AiRoute = (typeof AI_ROUTES)[number];

/** Upper bound on the user text sent to one route. TB-25 adds the real input hardening on top. */
export const MAX_AI_INPUT_CHARS = 8000;

export const aiGatewayRequestSchema = z.strictObject({
  input: z.string().trim().min(1).max(MAX_AI_INPUT_CHARS),
});
export type AiGatewayRequest = z.infer<typeof aiGatewayRequestSchema>;

export const aiUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

/** 200 body. `output` is the model's raw text; TB-24 adds per-route output schemas and repair. */
export const aiGatewaySuccessSchema = z.object({
  requestId: z.string(),
  route: z.enum(AI_ROUTES),
  model: z.string(),
  output: z.string(),
  usage: aiUsageSchema,
});
export type AiGatewaySuccess = z.infer<typeof aiGatewaySuccessSchema>;

export const AI_ERROR_CODES = [
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'BAD_REQUEST',
  'AI_NOT_CONFIGURED',
  'AI_TIMEOUT',
  'AI_PROVIDER_ERROR',
  'AI_BAD_OUTPUT',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** Non-2xx body. `message` is generic and never echoes user text or provider detail. */
export const aiGatewayErrorSchema = z.object({
  requestId: z.string(),
  error: z.object({ code: z.enum(AI_ERROR_CODES), message: z.string() }),
});
export type AiGatewayError = z.infer<typeof aiGatewayErrorSchema>;
