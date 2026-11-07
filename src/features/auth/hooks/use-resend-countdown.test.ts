import { RESEND_COOLDOWN_SECONDS, resendSecondsLeft } from './use-resend-countdown';

describe('resendSecondsLeft (TB-20 AC2)', () => {
  const sentAt = 1_000_000;

  it('is 30 seconds right after sending and 0 after 30 seconds', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(30);
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(30);
    expect(resendSecondsLeft(sentAt, sentAt + 29_001)).toBe(1);
    expect(resendSecondsLeft(sentAt, sentAt + 30_000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 120_000)).toBe(0);
  });

  it('is 0 before any code was sent and never above 30 (clock lag)', () => {
    expect(resendSecondsLeft(null, sentAt)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt - 5_000)).toBe(30);
  });
});
