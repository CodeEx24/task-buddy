// User-facing sign-in strings (TB-20), kept in one place so wording is reviewed together.
// Never say whether an email already has an account (spec T4).
export const SIGN_IN_COPY = {
  title: 'Sign in to Task Buddy',
  emailIntro: "Enter your email and we'll send you a 6-digit code. No password needed.",
  emailLabel: 'Email',
  sendCode: 'Send code',
  codeTitle: 'Check your email',
  codeIntro: (maskedEmail: string) =>
    `We sent a 6-digit code to ${maskedEmail}. Enter the latest code you received.`,
  codeLabel: '6-digit code',
  verify: 'Verify',
  resend: 'Resend code',
  resendIn: (seconds: number) => `Resend code in 0:${String(seconds).padStart(2, '0')}`,
  codeResent: 'New code sent. Check your email.',
  changeEmail: 'Use a different email',
} as const;

export const SIGN_IN_ERRORS = {
  invalidEmail: 'Enter a valid email address.',
  invalidCode: 'That code is wrong or has expired. Check the latest email or request a new code.',
  network: 'No connection. Check your internet and try again.',
  rateLimitedSend: 'Too many requests. Wait a moment and try again.',
  rateLimitedVerify: 'Too many attempts. Wait a few minutes or request a new code.',
  unknown: 'Something went wrong. Please try again.',
} as const;

export const SIGN_OUT_COPY = {
  button: 'Sign out',
  confirmTitle: 'Sign out?',
  confirmMessage: 'Your tasks stay on this device. You can sign in again with your email.',
  cancel: 'Cancel',
  confirm: 'Sign out',
} as const;
