import { EnvError, parseEnv, type RawEnv } from './env';

// Fixtures are assembled at runtime so no secret-shaped literal sits in the repo.
const SECRET_PREFIX = ['sb', 'secret', ''].join('_');
const base64Url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fakeJwt = (payload: object) => `${base64Url({ alg: 'HS256' })}.${base64Url(payload)}.sig`;

const VALID: RawEnv = {
  EXPO_PUBLIC_APP_ENV: 'staging',
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value_123',
};

function issuesOf(raw: RawEnv): readonly { name: string; rule: string }[] {
  try {
    parseEnv(raw);
  } catch (error) {
    if (error instanceof EnvError) return error.issues;
    throw error;
  }
  throw new Error('expected parseEnv to throw');
}

describe('parseEnv', () => {
  it.each(['development', 'staging', 'production'] as const)('accepts a valid %s env', (appEnv) => {
    expect(parseEnv({ ...VALID, EXPO_PUBLIC_APP_ENV: appEnv })).toEqual({
      appEnv,
      supabaseUrl: VALID.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: VALID.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it('names every missing variable', () => {
    expect(issuesOf({})).toEqual([
      { name: 'EXPO_PUBLIC_APP_ENV', rule: 'is required' },
      { name: 'EXPO_PUBLIC_SUPABASE_URL', rule: 'is required' },
      { name: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', rule: 'is required' },
    ]);
  });

  it('treats empty strings as missing', () => {
    expect(issuesOf({ ...VALID, EXPO_PUBLIC_SUPABASE_URL: '' })).toEqual([
      { name: 'EXPO_PUBLIC_SUPABASE_URL', rule: 'is required' },
    ]);
  });

  it('rejects an unknown app env', () => {
    expect(issuesOf({ ...VALID, EXPO_PUBLIC_APP_ENV: 'prod' })).toEqual([
      { name: 'EXPO_PUBLIC_APP_ENV', rule: 'must be one of development, staging, production' },
    ]);
  });

  it('rejects a value that is not a URL', () => {
    expect(
      issuesOf({ ...VALID, EXPO_PUBLIC_SUPABASE_URL: 'abcdefghijklmnop.supabase.co' }),
    ).toEqual([{ name: 'EXPO_PUBLIC_SUPABASE_URL', rule: 'must be an http(s) URL' }]);
  });

  it('allows http only in development (local stack)', () => {
    const local = { ...VALID, EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
    expect(parseEnv({ ...local, EXPO_PUBLIC_APP_ENV: 'development' }).supabaseUrl).toBe(
      'http://127.0.0.1:54321',
    );
    expect(issuesOf({ ...local, EXPO_PUBLIC_APP_ENV: 'production' })).toEqual([
      { name: 'EXPO_PUBLIC_SUPABASE_URL', rule: 'must use https outside development' },
    ]);
  });

  it('rejects a secret key pasted as the publishable key', () => {
    expect(
      issuesOf({ ...VALID, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `${SECRET_PREFIX}abc123` }),
    ).toEqual([
      {
        name: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        rule: 'must not be a secret or service-role key (use the publishable key)',
      },
    ]);
  });

  it('rejects a legacy service_role JWT', () => {
    const key = fakeJwt({ role: 'service_role', iss: 'supabase' });
    expect(issuesOf({ ...VALID, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toEqual([
      {
        name: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        rule: 'must not be a secret or service-role key (use the publishable key)',
      },
    ]);
  });

  it('rejects a legacy anon JWT (publishable key required)', () => {
    const key = fakeJwt({ role: 'anon', iss: 'supabase' });
    expect(issuesOf({ ...VALID, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toEqual([
      { name: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', rule: 'must start with sb_publishable_' },
    ]);
  });

  it('never puts input values in the error message', () => {
    const secret = `${SECRET_PREFIX}do_not_print_me`;
    const url = 'ftp://do-not-print.example';
    try {
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'qa-leak',
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
      });
      throw new Error('expected parseEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as EnvError).message;
      expect(message).not.toContain(secret);
      expect(message).not.toContain('do_not_print_me');
      expect(message).not.toContain('do-not-print');
      expect(message).not.toContain('qa-leak');
      expect(message).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    }
  });
});

describe('getEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  it('reads the EXPO_PUBLIC_* variables and memoizes the result', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_from_process_env';
    const { getEnv } = jest.requireActual<typeof import('./env')>('./env');
    const first = getEnv();
    expect(first.supabasePublishableKey).toBe('sb_publishable_from_process_env');
    expect(getEnv()).toBe(first);
  });

  it('throws EnvError when the variables are missing', () => {
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const { getEnv, EnvError: FreshEnvError } = jest.requireActual<typeof import('./env')>('./env');
    expect(() => getEnv()).toThrow(FreshEnvError);
  });
});
