// App environment config, validated at the boundary (TB-19).
// Only EXPO_PUBLIC_* values reach the bundle, and they are public by design. The Supabase secret
// (service-role) key must never be one of them: parseEnv rejects anything shaped like it.
import { z } from 'zod';

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export type Env = {
  appEnv: AppEnv;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

/** The raw variables, keyed by their EXPO_PUBLIC_* names. */
export type RawEnv = {
  EXPO_PUBLIC_APP_ENV?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type EnvIssue = { name: keyof RawEnv; rule: string };

/** Names the bad variables and the rule each broke. Never includes the values. */
export class EnvError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(
      `Invalid app environment: ${issues.map((i) => `${i.name} ${i.rule}`).join('; ')}. ` +
        'Set the EXPO_PUBLIC_* variables for this EAS environment (docs/actions/supabase-projects.md).',
    );
    this.name = 'EnvError';
    this.issues = issues;
  }
}

const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_';
// Built at runtime on purpose: Hermes packs string literals back to back, so a literal
// `sb_secret_` followed by an unrelated string looks like a leaked key to the bundle scanner
// (scripts/check-bundle-secrets.ts). Same trick as the scanner itself. Don't inline it.
const SECRET_KEY_PREFIX = ['sb', 'secret', ''].join('_');

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
}

/** A legacy service_role JWT: three dot-separated parts whose payload says role = service_role. */
function isServiceRoleJwt(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    return (
      typeof payload === 'object' &&
      payload !== null &&
      (payload as { role?: unknown }).role === 'service_role'
    );
  } catch {
    return false;
  }
}

export function isSecretKeyShaped(value: string): boolean {
  return value.startsWith(SECRET_KEY_PREFIX) || isServiceRoleJwt(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

const required = (rule: string) => (issue: { input: unknown }) =>
  issue.input === undefined || issue.input === '' ? 'is required' : rule;

const rawEnvSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(APP_ENVS, {
    error: required(`must be one of ${APP_ENVS.join(', ')}`),
  }),
  EXPO_PUBLIC_SUPABASE_URL: z
    .string({ error: required('must be a string') })
    .min(1, { error: 'is required' })
    .refine(isHttpUrl, { error: 'must be an http(s) URL' }),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: required('must be a string') })
    .min(1, { error: 'is required' })
    .refine((key) => !isSecretKeyShaped(key), {
      error: 'must not be a secret or service-role key (use the publishable key)',
      abort: true,
    })
    .refine((key) => key.startsWith(PUBLISHABLE_KEY_PREFIX), {
      error: `must start with ${PUBLISHABLE_KEY_PREFIX}`,
    }),
});

/** Pure: validates raw variables and returns typed config, or throws EnvError. */
export function parseEnv(raw: RawEnv): Env {
  // Treat empty strings as missing so `EXPO_PUBLIC_X=` in a .env file reads as "is required".
  const input = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value === '' ? undefined : value]),
  );
  const result = rawEnvSchema.safeParse(input);
  const issues: EnvIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = issue.path[0];
      if (typeof name === 'string' && name in rawEnvSchema.shape) {
        issues.push({ name: name as keyof RawEnv, rule: issue.message });
      }
    }
    throw new EnvError(issues);
  }

  const data = result.data;
  if (
    data.EXPO_PUBLIC_APP_ENV !== 'development' &&
    !data.EXPO_PUBLIC_SUPABASE_URL.startsWith('https:')
  ) {
    throw new EnvError([
      { name: 'EXPO_PUBLIC_SUPABASE_URL', rule: 'must use https outside development' },
    ]);
  }

  return {
    appEnv: data.EXPO_PUBLIC_APP_ENV,
    supabaseUrl: data.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: data.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * Expo inlines EXPO_PUBLIC_* only for static dot access (`process.env.EXPO_PUBLIC_X`).
 * Destructuring or bracket access silently yields undefined, so keep each read spelled out.
 */
function readRawEnv(): RawEnv {
  return {
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

let cached: Env | undefined;

/** Parsed app config. Lazy, so modules that never talk to Supabase don't need the variables. */
export function getEnv(): Env {
  cached ??= parseEnv(readRawEnv());
  return cached;
}

// --- Crash reporting (TB-37) -------------------------------------------------------------------
// Read separately from getEnv() so a missing Supabase variable never switches crash reporting
// off (that is exactly the crash we want to see) and so this never throws at app start.

export type CrashReportingEnv = {
  /** `undefined` when EXPO_PUBLIC_APP_ENV is missing or unknown. */
  appEnv: AppEnv | undefined;
  /** `undefined` when EXPO_PUBLIC_SENTRY_DSN is missing or not a Sentry DSN: reporting stays off. */
  sentryDsn: string | undefined;
};

export type RawCrashReportingEnv = {
  EXPO_PUBLIC_APP_ENV?: string;
  EXPO_PUBLIC_SENTRY_DSN?: string;
};

// https://<32-hex public key>@<ingest host>/<numeric project id>. The DSN is public by design;
// anything with a password part or a token shape is rejected so a secret is never sent along.
const SENTRY_DSN = /^https:\/\/[0-9a-f]{32}@[a-z0-9.-]+(:\d{1,5})?\/\d+$/;

export const sentryDsnSchema = z.string().trim().regex(SENTRY_DSN);

/** Pure and total: invalid values become `undefined` instead of throwing. */
export function parseCrashReportingEnv(raw: RawCrashReportingEnv): CrashReportingEnv {
  const appEnv = z.enum(APP_ENVS).safeParse(raw.EXPO_PUBLIC_APP_ENV);
  const dsn = sentryDsnSchema.safeParse(raw.EXPO_PUBLIC_SENTRY_DSN);
  return {
    appEnv: appEnv.success ? appEnv.data : undefined,
    sentryDsn: dsn.success ? dsn.data : undefined,
  };
}

/** Crash-reporting config from the bundle's EXPO_PUBLIC_* values (static reads, see above). */
export function getCrashReportingEnv(): CrashReportingEnv {
  return parseCrashReportingEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  });
}
