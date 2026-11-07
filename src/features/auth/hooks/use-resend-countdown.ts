import { useNow } from '@/lib/use-now';

/** AC2: a new code can be requested 30 seconds after the last one was sent. */
export const RESEND_COOLDOWN_SECONDS = 30;

/** Seconds left before "Resend" unlocks. Pure: derived from timestamps, so it survives backgrounding. */
export function resendSecondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  const remainingMs = sentAt + RESEND_COOLDOWN_SECONDS * 1000 - now;
  return Math.min(RESEND_COOLDOWN_SECONDS, Math.max(0, Math.ceil(remainingMs / 1000)));
}

/** Re-reads the clock every second while on the code step. */
export function useResendCountdown(sentAt: number | null): number {
  const now = useNow(1000);
  return resendSecondsLeft(sentAt, now);
}
