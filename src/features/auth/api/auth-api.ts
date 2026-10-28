// Email OTP sign-in calls (TB-20). Inputs are validated here (the boundary); Supabase errors are
// mapped to a small set of reasons so screens never show raw server messages. Nothing is logged:
// emails, codes and sessions are personal data or bearer secrets.
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import { getAuthClient } from '../session/auth-client';
import { emailSchema, otpCodeSchema } from '../schema';

export type AuthFailure = 'invalid_email' | 'invalid_code' | 'rate_limited' | 'network' | 'unknown';
export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

const fail = (reason: AuthFailure): AuthResult => ({ ok: false, reason });

/** Maps a supabase-js error (or a thrown value) to a reason. Pure; exported for tests. */
export function classifyAuthError(error: unknown, step: 'send' | 'verify'): AuthFailure {
  if (isAuthRetryableFetchError(error)) return 'network';
  if (isAuthApiError(error)) {
    if (
      error.status === 429 ||
      error.code === 'over_email_send_rate_limit' ||
      error.code === 'over_request_rate_limit'
    ) {
      return 'rate_limited';
    }
    if (step === 'verify' && (error.code === 'otp_expired' || error.status === 403)) {
      return 'invalid_code';
    }
    if (step === 'send' && error.code === 'email_address_invalid') return 'invalid_email';
  }
  if (error instanceof TypeError) return 'network'; // fetch itself failed
  return 'unknown';
}

/** Sends a 6-digit code. Creates the account on first use (D9-A), so the reply is the same either way. */
export async function requestCode(rawEmail: string): Promise<AuthResult> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return fail('invalid_email');
  try {
    const { error } = await getAuthClient().signInWithOtp({
      email: email.data,
      options: { shouldCreateUser: true },
    });
    return error ? fail(classifyAuthError(error, 'send')) : { ok: true };
  } catch (error) {
    return fail(classifyAuthError(error, 'send'));
  }
}

/** Exchanges the code for a session. supabase-js stores it (SecureStore) and emits SIGNED_IN. */
export async function verifyCode(rawEmail: string, rawCode: string): Promise<AuthResult> {
  const email = emailSchema.safeParse(rawEmail);
  const code = otpCodeSchema.safeParse(rawCode);
  if (!email.success) return fail('invalid_email');
  if (!code.success) return fail('invalid_code');
  try {
    const { data, error } = await getAuthClient().verifyOtp({
      email: email.data,
      token: code.data,
      type: 'email',
    });
    if (error) return fail(classifyAuthError(error, 'verify'));
    return data.session ? { ok: true } : fail('unknown');
  } catch (error) {
    return fail(classifyAuthError(error, 'verify'));
  }
}

/**
 * Signs out on this device only. supabase-js (2.118) removes the stored session even when the
 * revoke request fails (offline), so this always ends signed out locally; the server-side refresh
 * token then expires on its own.
 */
export async function signOut(): Promise<void> {
  try {
    await getAuthClient().signOut({ scope: 'local' });
  } catch {
    // Local removal already happened inside supabase-js; nothing useful to show.
  }
}
