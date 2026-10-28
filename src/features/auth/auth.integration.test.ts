// TB-20 (spec D8-A): email OTP sign-in against a real Supabase Auth server and Mailpit.
// Runs only in the CI `auth` job (`supabase start` with Auth + Mailpit), or locally with Docker:
//   SUPABASE_AUTH_IT=1 SUPABASE_AUTH_IT_KEY=<local publishable/anon key> pnpm jest auth.integration
// Exercises the app's own code path: auth-api → supabase-js → the chunked SecureStore adapter
// (over an in-memory SecureStore), plus the TB-19 profiles trigger and RLS.

const IS_ENABLED = process.env.SUPABASE_AUTH_IT === '1';
const API_KEY = process.env.SUPABASE_AUTH_IT_KEY ?? '';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const IOS_LIMIT_BYTES = 2048;

// The real auth client, not the global fake from testing/jest-setup.ts.
jest.unmock('@/features/auth/session/auth-client');

jest.mock('@/lib/env', () => ({
  getEnv: () => ({
    appEnv: 'development',
    supabaseUrl: process.env.SUPABASE_AUTH_IT_URL ?? 'http://127.0.0.1:54321',
    supabasePublishableKey: process.env.SUPABASE_AUTH_IT_KEY ?? '',
  }),
}));

// An in-memory SecureStore that rejects values over the iOS limit, like the real one may.
const mockSecureStoreData = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => mockSecureStoreData.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (Buffer.byteLength(value, 'utf8') > 2048) throw new Error('Value too large');
    mockSecureStoreData.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecureStoreData.delete(key);
  },
}));

type MailpitSummary = { ID: string; To: { Address: string }[] };

async function readCodeFromMailpit(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: MailpitSummary[] };
      const latest = messages?.find((m) => m.To.some((to) => to.Address === email));
      if (latest) {
        const message = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
        ).json()) as {
          Text?: string;
          HTML?: string;
        };
        const code = /\b(\d{6})\b/.exec(`${message.Text ?? ''} ${message.HTML ?? ''}`)?.[1];
        if (code) return code;
        throw new Error(
          'Sign-in email has no 6-digit code: check supabase/templates/otp-code.html',
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email for ${email} in Mailpit (${MAILPIT_URL})`);
}

const describeIfEnabled = IS_ENABLED ? describe : describe.skip;

describeIfEnabled('email OTP sign-in against local Supabase (TB-20 AC1–AC3)', () => {
  jest.setTimeout(60_000);

  beforeAll(() => {
    if (!API_KEY)
      throw new Error('Set SUPABASE_AUTH_IT_KEY to the local stack publishable/anon key');
  });

  it('code email → wrong code rejected → right code signs in → profile row → sign-out clears', async () => {
    const { requestCode, signOut, verifyCode } =
      jest.requireActual<typeof import('./api/auth-api')>('./api/auth-api');
    const { getSupabaseClient } =
      jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase');
    const supabase = getSupabaseClient();
    const email = `tb20-it-${Date.now()}@example.com`;

    // Send: one email with a 6-digit code and no link (D3-A).
    await expect(requestCode(email)).resolves.toEqual({ ok: true });
    const code = await readCodeFromMailpit(email);
    expect(code).toMatch(/^\d{6}$/);

    // Resend right away is refused by the server (30 s interval, D5-A).
    await expect(requestCode(email)).resolves.toEqual({ ok: false, reason: 'rate_limited' });

    // AC2: a wrong code is rejected and does not sign in.
    const wrongCode = code === '000000' ? '111111' : '000000';
    await expect(verifyCode(email, wrongCode)).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    expect((await supabase.auth.getSession()).data.session).toBeNull();

    // AC1: the right code signs in.
    await expect(verifyCode(email, code)).resolves.toEqual({ ok: true });
    const { session } = (await supabase.auth.getSession()).data;
    expect(session?.user.email).toBe(email);

    // AC3: the session went to SecureStore through the chunking adapter, every value under the limit.
    const keys = [...mockSecureStoreData.keys()];
    expect(keys.some((key) => key.endsWith('-auth-token.manifest'))).toBe(true);
    for (const value of mockSecureStoreData.values()) {
      expect(Buffer.byteLength(value, 'utf8')).toBeLessThanOrEqual(IOS_LIMIT_BYTES);
    }

    // TB-19 trigger created the profile; RLS shows only the user's own row.
    const profiles = await supabase.from('profiles').select('id');
    expect(profiles.error).toBeNull();
    expect(profiles.data).toEqual([{ id: session?.user.id }]);

    // AC3: refresh works against the real server.
    const refreshed = await supabase.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session?.access_token).toBeTruthy();

    // AC3: sign-out clears the stored session.
    await signOut();
    expect((await supabase.auth.getSession()).data.session).toBeNull();
    expect([...mockSecureStoreData.keys()].filter((key) => key.includes('-auth-token'))).toEqual(
      [],
    );
    await supabase.auth.stopAutoRefresh();
  });
});
