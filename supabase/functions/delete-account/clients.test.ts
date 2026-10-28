// TB-53: the Auth identity lookup and the admin delete client (stubbed fetch).
import { createSupabaseAccountIdentifier } from './account-auth';
import { AuthAdminError, createSupabaseAuthAdmin } from './auth-admin';

const USER_ID = '0190f3b2-0000-7000-8000-00000000a001';

type Call = { url: string; init: RequestInit };

function stubFetch(response: Response | Error) {
  const calls: Call[] = [];
  const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { fetchStub, calls };
}

describe('createSupabaseAccountIdentifier', () => {
  function identifierFor(response: Response | Error) {
    const { fetchStub, calls } = stubFetch(response);
    const identifier = createSupabaseAccountIdentifier({
      supabaseUrl: 'http://127.0.0.1:55321/',
      apiKey: 'public-anon-key',
      fetch: fetchStub,
    });
    return { identifier, calls };
  }

  it('a live session → the user id, asked of /auth/v1/user with the token and the anon key', async () => {
    const { identifier, calls } = identifierFor(Response.json({ id: USER_ID }));
    await expect(identifier.identify('jwt')).resolves.toEqual({ kind: 'user', id: USER_ID });
    expect(calls[0]?.url).toBe('http://127.0.0.1:55321/auth/v1/user');
    expect(calls[0]?.init.headers).toEqual({
      Authorization: 'Bearer jwt',
      apikey: 'public-anon-key',
    });
  });

  it('403 user_not_found (signed token, user gone) → deleted', async () => {
    const { identifier } = identifierFor(
      Response.json(
        {
          code: 403,
          error_code: 'user_not_found',
          msg: 'User from sub claim in JWT does not exist',
        },
        { status: 403 },
      ),
    );
    await expect(identifier.identify('jwt')).resolves.toEqual({ kind: 'deleted' });
  });

  it.each([
    ['401 bad JWT', Response.json({ error_code: 'bad_jwt' }, { status: 401 })],
    ['403 another error code', Response.json({ error_code: 'session_not_found' }, { status: 403 })],
    ['403 without a JSON body', new Response('nope', { status: 403 })],
    [
      '404 user_not_found (not the signed-token path)',
      Response.json({ error_code: 'user_not_found' }, { status: 404 }),
    ],
    ['200 without an id (anon key)', Response.json({ role: 'anon' })],
    ['a network error', new TypeError('fetch failed')],
  ])('%s → invalid', async (_label, response) => {
    const { identifier } = identifierFor(response);
    await expect(identifier.identify('jwt')).resolves.toEqual({ kind: 'invalid' });
  });
});

describe('createSupabaseAuthAdmin', () => {
  function adminFor(response: Response | Error) {
    const { fetchStub, calls } = stubFetch(response);
    const admin = createSupabaseAuthAdmin({
      supabaseUrl: 'http://kong:8000',
      serviceRoleKey: 'service-role-key',
      fetch: fetchStub,
    });
    return { admin, calls };
  }

  it('hard-deletes with the service role: DELETE /auth/v1/admin/users/<id>', async () => {
    const { admin, calls } = adminFor(Response.json({}));
    await expect(admin.deleteUser(USER_ID)).resolves.toBe('deleted');
    expect(calls[0]?.url).toBe(`http://kong:8000/auth/v1/admin/users/${USER_ID}`);
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ should_soft_delete: false }));
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: 'Bearer service-role-key',
      apikey: 'service-role-key',
    });
  });

  it('404 → not_found (someone else deleted it first)', async () => {
    const { admin } = adminFor(Response.json({ error_code: 'user_not_found' }, { status: 404 }));
    await expect(admin.deleteUser(USER_ID)).resolves.toBe('not_found');
  });

  it('other failures throw AuthAdminError with the status only', async () => {
    const { admin } = adminFor(Response.json({ msg: 'secret detail' }, { status: 500 }));
    const error = await admin.deleteUser(USER_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthAdminError);
    expect((error as AuthAdminError).status).toBe(500);
    expect((error as AuthAdminError).message).not.toContain('secret detail');
  });

  it('a network failure throws AuthAdminError', async () => {
    const { admin } = adminFor(new TypeError('fetch failed'));
    await expect(admin.deleteUser(USER_ID)).rejects.toBeInstanceOf(AuthAdminError);
  });

  it('refuses a non-UUID id without calling Auth (it becomes part of the URL)', async () => {
    const { admin, calls } = adminFor(Response.json({}));
    await expect(admin.deleteUser('../users')).rejects.toBeInstanceOf(AuthAdminError);
    expect(calls).toHaveLength(0);
  });
});
