// Boundary validation for the sign-in form (TB-20). Both values are checked before any network
// call, and the normalized value is what gets sent, so send and verify always use the same email.
import { z } from 'zod';

/** RFC 5321 caps a forward path at 256 octets including the angle brackets. */
export const MAX_EMAIL_LENGTH = 254;
export const OTP_CODE_LENGTH = 6;

export const emailSchema = z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).pipe(z.email());

export const otpCodeSchema = z.string().regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`));

/** Keeps digits only (pasted "123 456", autofill with separators), capped at the code length. */
export function normalizeOtpInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
}

/** `jane@example.com` → `j•••@example.com`. Shown on screen instead of the full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}
