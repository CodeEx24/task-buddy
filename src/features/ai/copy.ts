// User-facing AI error strings (TB-23, https://stratyge.atlassian.net/browse/TB-23), kept in one
// place so the wording is reviewed together. Friendly, no blame, always says when to try again.
import type { GatewayError } from './gateway-errors';

/** "about 45 minutes", "about 2 hours", "a moment". Rounds up so we never promise too early. */
export function formatWait(seconds: number | null): string {
  if (seconds === null || seconds <= 60) return 'a moment';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}

export const AI_ERROR_TITLES = {
  rate_limited: 'Your buddy needs a short break',
  quota_exceeded: "You've used today's AI allowance",
  other: 'Your buddy is unavailable',
} as const;

export function gatewayErrorTitle(error: GatewayError): string {
  if (error.kind === 'rate_limited') return AI_ERROR_TITLES.rate_limited;
  if (error.kind === 'quota_exceeded') return AI_ERROR_TITLES.quota_exceeded;
  return AI_ERROR_TITLES.other;
}

export function gatewayErrorMessage(error: GatewayError): string {
  switch (error.kind) {
    case 'rate_limited':
      return `You've made a lot of AI requests this hour. Try again in ${formatWait(error.retryAfterSeconds)}. You can still add and edit tasks yourself.`;
    case 'quota_exceeded':
      return `Your daily AI allowance resets at midnight UTC, in ${formatWait(error.retryAfterSeconds)}. You can still add and edit tasks yourself.`;
    case 'unauthenticated':
      return 'Your session has ended. Sign in again to use your buddy.';
    case 'timeout':
      return 'Your buddy took too long to answer. Try again.';
    case 'bad_request':
      return "Your buddy couldn't read that. Try rewording it.";
    case 'input_too_long':
      return 'That is too long for your buddy. Keep it under 2,000 characters, or split it up.';
    case 'unavailable':
    case 'unknown':
      return 'Your buddy is unavailable right now. Try again in a moment.';
  }
}
