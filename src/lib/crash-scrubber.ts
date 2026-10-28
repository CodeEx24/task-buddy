// PII scrubber for crash reports (TB-37, https://stratyge.atlassian.net/browse/TB-37).
// Runs as Sentry's beforeSend / beforeBreadcrumb. Pure and vendor-shaped (plain objects), so it is
// unit-tested without the SDK. Rule: a crash report may say *where* and *what kind*, never the
// user's task text, notes, email, OTP code or any token.

export const REDACTED = '[redacted]';

const MAX_DEPTH = 8;

// Keys whose values are user content or credentials. Compared lowercased with -, _ and spaces
// removed, so `access_token`, `accessToken` and `Access-Token` all match.
const SENSITIVE_KEYS = new Set([
  'title',
  'notes',
  'note',
  'text',
  'body',
  'description',
  'content',
  'prompt',
  'label',
  'email',
  'phone',
  'otp',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'providertoken',
  'password',
  'secret',
  'authorization',
  'cookie',
  'cookies',
  'apikey',
  'params',
]);

const normalizeKey = (key: string) => key.toLowerCase().replace(/[-_\s]/g, '');

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

// Patterns are written so no complete credential prefix sits in the bundle as a literal.
const TEXT_RULES: readonly [RegExp, string][] = [
  // Drizzle's DrizzleQueryError message ends with the bound values: "Failed query: …\nparams: …".
  [/(\bparams:)[\s\S]*$/i, `$1 ${REDACTED}`],
  [/[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi, '[email]'],
  [/\bBearer\s+\S+/gi, 'Bearer [token]'],
  [/\beyJ[\w-]*\.[\w-]+\.[\w-]*/g, '[token]'],
  // Supabase keys (sb_<kind>_…) and Sentry auth tokens (sntry<s|u>_…).
  [/\bsb_[a-z]+_[\w-]+/gi, '[token]'],
  [/\bsntry[a-z]_[\w=+/-]+/gi, '[token]'],
  // Email OTP codes are six digits.
  [/\b\d{6}\b/g, '[code]'],
];

/** Removes emails, tokens, keys, OTP codes and bound query values from free text. */
export function scrubText(text: string): string {
  return TEXT_RULES.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}

/** Drops the query string and fragment, where tokens and emails tend to travel. */
export function scrubUrl(url: string): string {
  return url.split(/[?#]/)[0] ?? '';
}

/** Deep copy with sensitive keys redacted and every string run through scrubText. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : scrubValue(item, depth + 1),
    ]),
  );
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

// Structural types: the subset of Sentry's Breadcrumb / ErrorEvent this module reads or writes.
// No index signatures, so the SDK's own interfaces satisfy them as-is.
export type ScrubbableBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type ScrubbableEvent = {
  message?: string;
  server_name?: string;
  user?: { id?: string | number };
  request?: { url?: string };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
};

type TouchPathEntry = { name?: unknown; label?: unknown; [key: string]: unknown };

/** Touch breadcrumbs carry a `label` (often the pressed row's visible text). Keep names only. */
function scrubTouchBreadcrumb(crumb: ScrubbableBreadcrumb): ScrubbableBreadcrumb {
  const path = Array.isArray(crumb.data?.path) ? (crumb.data.path as TouchPathEntry[]) : [];
  const names = path.map(({ label: _label, ...rest }) => scrubValue(rest) as TouchPathEntry);
  const rootName = typeof names[0]?.name === 'string' ? names[0].name : 'unknown';
  return {
    ...crumb,
    message: `Touch event within element: ${rootName}`,
    data: { path: names },
  };
}

/** Console breadcrumbs keep only a leading `[tag]` (e.g. "[db]"): the rest may be user text. */
function scrubConsoleBreadcrumb(crumb: ScrubbableBreadcrumb): ScrubbableBreadcrumb {
  const tag = /^\[[\w:. -]{1,40}\]/.exec(crumb.message ?? '')?.[0];
  const { data: _data, ...rest } = crumb;
  return { ...rest, message: tag ? `${tag} ${REDACTED}` : REDACTED };
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  const category = crumb.category ?? '';
  if (category === 'console') return scrubConsoleBreadcrumb(crumb) as T;
  if (category === 'touch' || category.startsWith('ui.')) return scrubTouchBreadcrumb(crumb) as T;

  const data = asRecord(scrubValue(crumb.data));
  // fetch / xhr / navigation breadcrumbs: strip query strings from any URL-ish field.
  for (const key of ['url', 'from', 'to']) {
    if (data && typeof data[key] === 'string') data[key] = scrubUrl(data[key] as string);
  }
  return {
    ...crumb,
    ...(crumb.message === undefined ? {} : { message: scrubText(crumb.message) }),
    ...(data === undefined ? {} : { data }),
  };
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const out: ScrubbableEvent = { ...event };

  if (out.message !== undefined) out.message = scrubText(out.message);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((value) =>
        value.value === undefined ? value : { ...value, value: scrubText(value.value) },
      ),
    };
  }

  // Only an opaque id may identify a user; never an email, name or IP address.
  const userId = out.user?.id;
  if (userId === undefined) delete out.user;
  else out.user = { id: userId };

  if (out.request) {
    out.request = out.request.url === undefined ? {} : { url: scrubUrl(out.request.url) };
  }

  // The device name is often the owner's name ("Ana's iPhone"); server_name is the host name.
  delete out.server_name;
  const contexts = asRecord(scrubValue(out.contexts));
  const device = asRecord(contexts?.device);
  if (device) delete device.name;
  if (contexts) out.contexts = contexts;

  if (out.extra) out.extra = asRecord(scrubValue(out.extra));
  if (out.tags) out.tags = asRecord(scrubValue(out.tags));
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map((crumb) => scrubBreadcrumb(crumb));

  return out as T;
}
