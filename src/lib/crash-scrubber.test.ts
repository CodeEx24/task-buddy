import {
  REDACTED,
  isSensitiveKey,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
  scrubValue,
} from './crash-scrubber';

// Fixtures are assembled at runtime so no credential-shaped literal sits in the repo.
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ1c2VyIn0', 'c2ln'].join('.');
const SB_KEY = `${['sb', 'publishable', ''].join('_')}abc123XYZ`;
const SENTRY_TOKEN = `${['sntry', 's'].join('')}_${'QWxhZGRpbjpvcGVu'.repeat(2)}`;
const TASK_TITLE = 'Call mum about the surprise party';
const DEVICE_NAME = 'Ana’s iPhone';

describe('scrubText', () => {
  it.each([
    ['an email', 'sign-in failed for ana.cruz+tb@example.co.uk', 'sign-in failed for [email]'],
    ['a bearer token', `Authorization: Bearer ${JWT}`, 'Authorization: Bearer [token]'],
    ['a bare JWT', `token=${JWT} expired`, 'token=[token] expired'],
    ['a Supabase key', `key ${SB_KEY} rejected`, 'key [token] rejected'],
    ['a Sentry auth token', `upload with ${SENTRY_TOKEN}`, 'upload with [token]'],
    ['a six-digit OTP code', 'verifyOtp(482913) failed', 'verifyOtp([code]) failed'],
  ])('removes %s', (_name, input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it('drops the bound values Drizzle appends to a failed query', () => {
    const message = `Failed query: insert into "tasks" ("id", "title") values (?, ?)\nparams: 0192,${TASK_TITLE}`;
    const scrubbed = scrubText(message);
    expect(scrubbed).not.toContain(TASK_TITLE);
    expect(scrubbed).toContain('Failed query: insert into "tasks"');
    expect(scrubbed).toContain(`params: ${REDACTED}`);
  });

  it('leaves ordinary diagnostic text alone', () => {
    expect(scrubText('TypeError: undefined is not a function (line 1234)')).toBe(
      'TypeError: undefined is not a function (line 1234)',
    );
  });
});

describe('scrubUrl', () => {
  it('drops the query string and fragment', () => {
    expect(
      scrubUrl('https://x.supabase.co/auth/v1/verify?email=a@b.co&token=1#access_token=z'),
    ).toBe('https://x.supabase.co/auth/v1/verify');
  });
});

describe('scrubValue / isSensitiveKey', () => {
  it.each(['title', 'notes', 'email', 'access_token', 'refreshToken', 'Authorization', 'otp'])(
    'treats %s as sensitive',
    (key) => expect(isSensitiveKey(key)).toBe(true),
  );

  it.each(['id', 'code', 'name', 'status', 'priority'])('keeps %s', (key) =>
    expect(isSensitiveKey(key)).toBe(false),
  );

  it('redacts nested sensitive keys and scrubs strings, without mutating the input', () => {
    const input = { task: { id: 't1', title: TASK_TITLE, tags: ['a@b.co'] }, code: 'SQLITE_BUSY' };
    expect(scrubValue(input)).toEqual({
      task: { id: 't1', title: REDACTED, tags: ['[email]'] },
      code: 'SQLITE_BUSY',
    });
    expect(input.task.title).toBe(TASK_TITLE);
  });

  it('stops at a maximum depth', () => {
    let deep: Record<string, unknown> = { leaf: 'x' };
    for (let i = 0; i < 20; i += 1) deep = { next: deep };
    expect(JSON.stringify(scrubValue(deep))).toContain(REDACTED);
  });
});

describe('scrubBreadcrumb', () => {
  it('removes touch labels (on-screen task text) and rebuilds the message from names', () => {
    const crumb = scrubBreadcrumb({
      category: 'touch',
      message: `Touch event within element: ${TASK_TITLE}`,
      data: {
        path: [{ name: 'TaskRow', label: TASK_TITLE, file: 'TaskRow.tsx' }, { name: 'View' }],
      },
    });
    expect(JSON.stringify(crumb)).not.toContain(TASK_TITLE);
    expect(crumb).toEqual({
      category: 'touch',
      message: 'Touch event within element: TaskRow',
      data: { path: [{ name: 'TaskRow', file: 'TaskRow.tsx' }, { name: 'View' }] },
    });
  });

  it('keeps only the leading [tag] of a console breadcrumb', () => {
    expect(
      scrubBreadcrumb({
        category: 'console',
        message: `[db] save failed for ${TASK_TITLE}`,
        data: { arguments: [TASK_TITLE] },
      }),
    ).toEqual({ category: 'console', message: `[db] ${REDACTED}` });
    expect(scrubBreadcrumb({ category: 'console', message: TASK_TITLE })).toEqual({
      category: 'console',
      message: REDACTED,
    });
  });

  it('strips query strings from http breadcrumbs and redacts sensitive data', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: {
          url: 'https://x.supabase.co/rest/v1/tasks?title=eq.private',
          method: 'GET',
          body: '{}',
        },
      }),
    ).toEqual({
      category: 'fetch',
      data: { url: 'https://x.supabase.co/rest/v1/tasks', method: 'GET', body: REDACTED },
    });
  });
});

describe('scrubEvent', () => {
  const event = {
    message: 'OTP 123456 sent to ana@example.com',
    server_name: 'anas-macbook',
    user: { id: 'user-1', email: 'ana@example.com', ip_address: '10.0.0.1' },
    request: { url: 'https://x.supabase.co/auth/v1/otp?email=ana@example.com' },
    exception: { values: [{ value: `Failed query: update tasks\nparams: ${TASK_TITLE}` }] },
    breadcrumbs: [{ category: 'console', message: TASK_TITLE }],
    extra: { notes: 'my private notes', count: 3 },
    contexts: { device: { name: DEVICE_NAME, model: 'iPhone16,1' } },
    tags: { screen: 'today', email: 'ana@example.com' },
  };

  it('removes every piece of PII from an event', () => {
    const scrubbed = scrubEvent(event);
    const json = JSON.stringify(scrubbed);
    const leaks = [
      TASK_TITLE,
      'ana@example.com',
      '123456',
      'my private notes',
      DEVICE_NAME,
      'anas-macbook',
      '10.0.0.1',
    ];
    for (const leak of leaks) expect(json).not.toContain(leak);
    expect(scrubbed.user).toEqual({ id: 'user-1' });
    expect(scrubbed.request).toEqual({ url: 'https://x.supabase.co/auth/v1/otp' });
    expect(scrubbed.extra).toEqual({ notes: REDACTED, count: 3 });
    expect(scrubbed.contexts).toEqual({ device: { model: 'iPhone16,1' } });
    expect(scrubbed.tags).toEqual({ screen: 'today', email: REDACTED });
  });

  it('drops a user without an id and keeps the stack-relevant fields', () => {
    const scrubbed = scrubEvent({ user: {}, exception: { values: [{ value: 'boom' }] } });
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.exception).toEqual({ values: [{ value: 'boom' }] });
  });
});
