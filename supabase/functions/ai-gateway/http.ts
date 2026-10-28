// JSON response helpers for the AI gateway (TB-22). Error bodies follow `aiGatewayErrorSchema`.
import type { AiErrorCode } from '../../../packages/schemas/src/ai-gateway.ts';

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Retry-After (TB-23) so a web client can read it on a 429.
  'Access-Control-Expose-Headers': 'X-Request-Id, Retry-After',
};

const STATUS_BY_CODE: Readonly<Record<AiErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  AI_NOT_CONFIGURED: 500,
  INTERNAL: 500,
  AI_PROVIDER_ERROR: 502,
  AI_BAD_OUTPUT: 502,
  AI_TIMEOUT: 504,
};

const MESSAGE_BY_CODE: Readonly<Record<AiErrorCode, string>> = {
  UNAUTHENTICATED: 'A valid signed-in session is required.',
  NOT_FOUND: 'Unknown AI route.',
  METHOD_NOT_ALLOWED: 'Use POST.',
  BAD_REQUEST: 'The request body is invalid.',
  RATE_LIMITED: 'Too many AI requests. Try again later.',
  QUOTA_EXCEEDED: 'Daily AI limit reached. It resets at 00:00 UTC.',
  AI_NOT_CONFIGURED: 'The AI service is not configured.',
  INTERNAL: 'Something went wrong.',
  AI_PROVIDER_ERROR: 'The AI service is unavailable.',
  AI_BAD_OUTPUT: 'The AI returned an unusable answer.',
  AI_TIMEOUT: 'The AI service took too long to answer.',
};

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...headers },
  });
}

/** Generic error response: fixed message per code, so nothing user- or provider-supplied leaks. */
export function errorResponse(
  requestId: string,
  code: AiErrorCode,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(
    STATUS_BY_CODE[code],
    { requestId, error: { code, message: MESSAGE_BY_CODE[code] } },
    headers,
  );
}
