// TB-23 (https://stratyge.atlassian.net/browse/TB-23): gateway error mapping and friendly copy.
import { formatWait, gatewayErrorMessage, gatewayErrorTitle } from './copy';
import { mapGatewayError, parseRetryAfter } from './gateway-errors';

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
});
const body = (code: string) => ({ requestId: 'req-1', error: { code, message: 'x' } });
const NOW = Date.parse('2026-10-28T10:15:00Z');

describe('parseRetryAfter', () => {
  it.each([
    ['2700', 2700],
    [' 30 ', 30],
    ['0', 0],
    ['Wed, 28 Oct 2026 11:00:00 GMT', 2700],
    ['Wed, 28 Oct 2026 10:00:00 GMT', 0],
    ['soon', null],
    ['-5', null],
    ['', null],
  ])('%p → %p', (value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });

  it('is null when the header is missing', () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
  });
});

describe('mapGatewayError', () => {
  it('AC1: 429 RATE_LIMITED → rate_limited with Retry-After seconds', () => {
    expect(
      mapGatewayError(429, headers({ 'Retry-After': '2700' }), body('RATE_LIMITED'), NOW),
    ).toEqual({ kind: 'rate_limited', retryAfterSeconds: 2700, requestId: 'req-1' });
  });

  it('AC3: 429 QUOTA_EXCEEDED → quota_exceeded (distinct from the hourly limit)', () => {
    expect(
      mapGatewayError(429, headers({ 'Retry-After': '900' }), body('QUOTA_EXCEEDED'), NOW),
    ).toEqual({ kind: 'quota_exceeded', retryAfterSeconds: 900, requestId: 'req-1' });
  });

  it('a 429 with an unreadable body (e.g. a proxy) still reads as rate limited', () => {
    expect(
      mapGatewayError(429, headers({ 'Retry-After': '60', 'X-Request-Id': 'r9' }), 'nope', NOW),
    ).toEqual({ kind: 'rate_limited', retryAfterSeconds: 60, requestId: 'r9' });
  });

  it.each([
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [504, 'AI_TIMEOUT', 'timeout'],
    [502, 'AI_PROVIDER_ERROR', 'unavailable'],
    [502, 'AI_BAD_OUTPUT', 'unavailable'],
    [500, 'AI_NOT_CONFIGURED', 'unavailable'],
    [500, 'INTERNAL', 'unavailable'],
    [400, 'BAD_REQUEST', 'bad_request'],
    [413, 'INPUT_TOO_LONG', 'input_too_long'],
    [502, 'AI_UNSAFE_OUTPUT', 'unavailable'],
  ])('%i %s → %s, no Retry-After', (status, code, kind) => {
    expect(mapGatewayError(status, headers({ 'Retry-After': '10' }), body(code), NOW)).toEqual({
      kind,
      retryAfterSeconds: null,
      requestId: 'req-1',
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [504, 'timeout'],
    [503, 'unavailable'],
    [400, 'bad_request'],
    [413, 'input_too_long'],
    [418, 'unknown'],
  ])('falls back to the HTTP status %i → %s without a valid body', (status, kind) => {
    expect(mapGatewayError(status, headers({}), undefined, NOW).kind).toBe(kind);
  });
});

describe('friendly messages (AC1 app part)', () => {
  it('formats waits, rounding up', () => {
    expect(formatWait(null)).toBe('a moment');
    expect(formatWait(30)).toBe('a moment');
    expect(formatWait(61)).toBe('about 2 minutes');
    expect(formatWait(2700)).toBe('about 45 minutes');
    expect(formatWait(3600)).toBe('about 1 hour');
    expect(formatWait(3601)).toBe('about 2 hours');
  });

  it('rate limited: says when to retry and that tasks still work', () => {
    const error = { kind: 'rate_limited', retryAfterSeconds: 2700, requestId: 'r' } as const;
    expect(gatewayErrorTitle(error)).toBe('Your buddy needs a short break');
    expect(gatewayErrorMessage(error)).toBe(
      "You've made a lot of AI requests this hour. Try again in about 45 minutes. You can still add and edit tasks yourself.",
    );
  });

  it('quota exceeded: says it resets at midnight UTC', () => {
    const error = { kind: 'quota_exceeded', retryAfterSeconds: 900, requestId: 'r' } as const;
    expect(gatewayErrorTitle(error)).toBe("You've used today's AI allowance");
    expect(gatewayErrorMessage(error)).toContain('resets at midnight UTC, in about 15 minutes');
  });

  it.each([
    'unauthenticated',
    'timeout',
    'bad_request',
    'input_too_long',
    'unavailable',
    'unknown',
  ] as const)('%s has a non-empty message without error codes', (kind) => {
    const message = gatewayErrorMessage({ kind, retryAfterSeconds: null, requestId: null });
    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toMatch(/[A-Z]{2,}_[A-Z]+/);
  });
});
