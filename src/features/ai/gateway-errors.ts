// Typed mapping of AI gateway error responses for the app (TB-23,
// https://stratyge.atlassian.net/browse/TB-23). The gateway client (TB-29) passes every non-2xx
// response through `mapGatewayError()` and shows `gatewayErrorMessage()` to the user. Pure: no
// network, no LLM; the app only ever talks to `supabase/functions/ai-gateway`.
import { aiGatewayErrorSchema } from '../../../packages/schemas/src/ai-gateway';

export type GatewayErrorKind =
  | 'rate_limited'
  | 'quota_exceeded'
  | 'unauthenticated'
  | 'timeout'
  | 'unavailable'
  | 'bad_request'
  | 'unknown';

export type GatewayError = {
  kind: GatewayErrorKind;
  /** Seconds until the user may try again (429 only), from the Retry-After header. */
  retryAfterSeconds: number | null;
  /** The gateway's request id, for support. Never shown with user text. */
  requestId: string | null;
};

type HeaderReader = { get(name: string): string | null };

/**
 * Retry-After as whole seconds: delta-seconds or an HTTP date (RFC 9110). Null when missing or
 * unreadable; never negative.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  // HTTP dates start with the day name ("Wed, 28 Oct 2026 11:00:00 GMT"); Date.parse alone
  // would also accept "-5" as a year.
  if (!/^[A-Za-z]{3},/.test(trimmed)) return null;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

const KIND_BY_CODE: Readonly<Record<string, GatewayErrorKind>> = {
  RATE_LIMITED: 'rate_limited',
  QUOTA_EXCEEDED: 'quota_exceeded',
  UNAUTHENTICATED: 'unauthenticated',
  AI_TIMEOUT: 'timeout',
  AI_PROVIDER_ERROR: 'unavailable',
  AI_NOT_CONFIGURED: 'unavailable',
  AI_BAD_OUTPUT: 'unavailable',
  INTERNAL: 'unavailable',
  BAD_REQUEST: 'bad_request',
};

function kindFromStatus(status: number): GatewayErrorKind {
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'unauthenticated';
  if (status === 504) return 'timeout';
  if (status === 400) return 'bad_request';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

/**
 * Maps a gateway error response (status, headers, parsed JSON body or anything else) to a
 * `GatewayError`. The body is validated with the shared schema; an unreadable body falls back to
 * the HTTP status, so a proxy's 429 still reads as rate limited.
 */
export function mapGatewayError(
  status: number,
  headers: HeaderReader,
  body: unknown,
  now: number = Date.now(),
): GatewayError {
  const parsed = aiGatewayErrorSchema.safeParse(body);
  const kind = parsed.success
    ? (KIND_BY_CODE[parsed.data.error.code] ?? kindFromStatus(status))
    : kindFromStatus(status);
  const isLimited = kind === 'rate_limited' || kind === 'quota_exceeded';
  return {
    kind,
    retryAfterSeconds: isLimited ? parseRetryAfter(headers.get('Retry-After'), now) : null,
    requestId: parsed.success ? parsed.data.requestId : headers.get('X-Request-Id'),
  };
}
