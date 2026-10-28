// TB-22: bearer parsing and the Supabase Auth verifier (stubbed fetch).
import { bearerToken, createSupabaseAuthVerifier } from './auth.ts';

const ANON = 'public-anon-key';

describe('bearerToken', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer  abc', 'abc'],
    ['  Bearer abc  ', 'abc'],
    [null, null],
    ['', null],
    ['Bearer', null],
    ['Bearer ', null],
    ['Basic abc', null],
    ['Bearer a b', null],
  ])('%p → %p', (header, token) => {
    expect(bearerToken(header)).toBe(token);
  });
});

describe('createSupabaseAuthVerifier', () => {
  function verifierFor(response: Response | Error) {
    const calls: { url: string; init: RequestInit }[] = [];
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'http://127.0.0.1:54321/',
      apiKey: ANON,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (response instanceof Error) throw response;
        return response;
      }) as typeof fetch,
    });
    return { verifier, calls };
  }

  it('returns the user id for a live session and sends token + apikey to /auth/v1/user', async () => {
    const { verifier, calls } = verifierFor(Response.json({ id: 'user-1', aud: 'authenticated' }));
    await expect(verifier.verify('jwt-1')).resolves.toEqual({ id: 'user-1' });
    expect(calls[0]?.url).toBe('http://127.0.0.1:54321/auth/v1/user');
    expect(calls[0]?.init.headers).toEqual({ Authorization: 'Bearer jwt-1', apikey: ANON });
  });

  it.each([
    ['401 from Auth', new Response('{"msg":"invalid JWT"}', { status: 401 })],
    ['403 (e.g. the anon key as bearer)', new Response('{}', { status: 403 })],
    ['200 without an id', Response.json({ role: 'anon' })],
    ['a network error', new TypeError('fetch failed')],
  ])('fails closed on %s', async (_label, response) => {
    const { verifier } = verifierFor(response);
    await expect(verifier.verify('jwt-1')).resolves.toBeNull();
  });

  it('fails closed when Auth does not answer within the timeout', async () => {
    jest.useFakeTimers();
    try {
      const verifier = createSupabaseAuthVerifier({
        supabaseUrl: 'http://auth',
        apiKey: ANON,
        timeoutMs: 100,
        fetch: ((_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })) as typeof fetch,
      });
      const pending = verifier.verify('jwt-1');
      await jest.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
