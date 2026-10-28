import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { getFakeAuth } from '../testing/fake-auth';
import { FAKE_VALID_CODE } from '../testing/fake-auth-client';
import { classifyAuthError, requestCode, signOut, verifyCode, type AuthFailure } from './auth-api';

beforeEach(() => getFakeAuth().control.reset({ signedIn: false }));

describe('classifyAuthError', () => {
  const cases: [string, unknown, 'send' | 'verify', AuthFailure][] = [
    ['retryable fetch error', new AuthRetryableFetchError('offline', 0), 'send', 'network'],
    ['fetch TypeError', new TypeError('Network request failed'), 'verify', 'network'],
    [
      'email send limit',
      new AuthApiError('slow down', 429, 'over_email_send_rate_limit'),
      'send',
      'rate_limited',
    ],
    [
      'request limit',
      new AuthApiError('slow down', 429, 'over_request_rate_limit'),
      'verify',
      'rate_limited',
    ],
    [
      'wrong or expired code',
      new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
      'verify',
      'invalid_code',
    ],
    [
      'invalid email',
      new AuthApiError('bad email', 400, 'email_address_invalid'),
      'send',
      'invalid_email',
    ],
    ['server error', new AuthApiError('boom', 500, 'unexpected_failure'), 'send', 'unknown'],
    ['anything else', new Error('???'), 'verify', 'unknown'],
  ];

  it.each(cases)('%s during %s → %s', (_name, error, step, expected) => {
    expect(classifyAuthError(error, step)).toBe(expected);
  });
});

describe('requestCode', () => {
  it('sends a normalized email and lets Supabase create the account on first use (D9-A)', async () => {
    const { mocks } = getFakeAuth();
    await expect(requestCode('  Jane@Example.com ')).resolves.toEqual({ ok: true });
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'jane@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('rejects an invalid email without a network call', async () => {
    const { mocks } = getFakeAuth();
    await expect(requestCode('jane@')).resolves.toEqual({ ok: false, reason: 'invalid_email' });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('maps a rate limit to rate_limited', async () => {
    getFakeAuth().control.failNextSend(new AuthApiError('wait', 429, 'over_email_send_rate_limit'));
    await expect(requestCode('jane@example.com')).resolves.toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });
});

describe('verifyCode', () => {
  it('verifies with type "email" and signs in on the right code', async () => {
    const fake = getFakeAuth();
    await expect(verifyCode('jane@example.com', FAKE_VALID_CODE)).resolves.toEqual({ ok: true });
    expect(fake.mocks.verifyOtp).toHaveBeenCalledWith({
      email: 'jane@example.com',
      token: FAKE_VALID_CODE,
      type: 'email',
    });
    expect(fake.control.session).not.toBeNull();
  });

  it('reports a wrong or expired code as invalid_code', async () => {
    await expect(verifyCode('jane@example.com', '000000')).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    expect(getFakeAuth().control.session).toBeNull();
  });

  it('rejects a malformed code without a network call', async () => {
    const { mocks } = getFakeAuth();
    await expect(verifyCode('jane@example.com', '12345')).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('signs out this device only', async () => {
    const fake = getFakeAuth();
    fake.control.reset({ signedIn: true });
    await signOut();
    expect(fake.mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(fake.control.session).toBeNull();
  });

  it('never throws, even if the client does', async () => {
    getFakeAuth().mocks.signOut.mockRejectedValueOnce(new Error('offline'));
    await expect(signOut()).resolves.toBeUndefined();
  });
});
