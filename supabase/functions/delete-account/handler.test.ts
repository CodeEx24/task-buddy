// TB-53: the delete-account handler with fake identity and admin clients.
import type { AccountIdentifier, AccountIdentity } from './account-auth';
import { AuthAdminError, type AdminDeleteResult, type AuthAdmin } from './auth-admin';
import { createDeleteAccountHandler, type DeleteAccountLogEntry } from './handler';

const USER_ID = '0190f3b2-0000-7000-8000-00000000a001';
const URL = 'http://localhost/delete-account';
const CONFIRM = JSON.stringify({ confirm: 'DELETE' });

function setup(
  identity: AccountIdentity = { kind: 'user', id: USER_ID },
  adminResult: AdminDeleteResult | Error = 'deleted',
) {
  const identify = jest.fn<Promise<AccountIdentity>, [string]>(async () => identity);
  const deleteUser = jest.fn<Promise<AdminDeleteResult>, [string]>(async () => {
    if (adminResult instanceof Error) throw adminResult;
    return adminResult;
  });
  const logs: DeleteAccountLogEntry[] = [];
  const handle = createDeleteAccountHandler({
    identity: { identify } satisfies AccountIdentifier,
    admin: { deleteUser } satisfies AuthAdmin,
    log: (entry) => logs.push(entry),
    newRequestId: () => 'req-1',
  });
  return { handle, identify, deleteUser, logs };
}

function post(body: string | null = CONFIRM, token: string | null = 'user-jwt'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(URL, { method: 'POST', headers, body });
}

describe('delete-account handler', () => {
  it('deletes the caller’s own account (id from Auth, never from the request) → 200 deleted', async () => {
    const { handle, identify, deleteUser, logs } = setup();
    const response = await handle(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requestId: 'req-1', status: 'deleted' });
    expect(response.headers.get('X-Request-Id')).toBe('req-1');
    expect(identify).toHaveBeenCalledWith('user-jwt');
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(logs).toEqual([
      expect.objectContaining({ requestId: 'req-1', status: 200, outcome: 'deleted' }),
    ]);
  });

  it('ignores any user id in the body: a strict body with extra keys is a 400', async () => {
    const { handle, deleteUser } = setup();
    const response = await handle(post(JSON.stringify({ confirm: 'DELETE', userId: 'other' })));
    expect(response.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('is idempotent: a signed session of an already-deleted account → 200 already_deleted', async () => {
    const { handle, deleteUser, logs } = setup({ kind: 'deleted' });
    const response = await handle(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requestId: 'req-1', status: 'already_deleted' });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(logs[0]?.outcome).toBe('already_deleted');
  });

  it('treats a concurrent delete (admin 404) as already deleted', async () => {
    const { handle, logs } = setup(undefined, 'not_found');
    const response = await handle(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requestId: 'req-1', status: 'already_deleted' });
    expect(logs[0]?.outcome).toBe('race_already_deleted');
  });

  it.each([
    ['no Authorization header', post(CONFIRM, null)],
    [
      'a malformed Authorization header',
      new Request(URL, { method: 'POST', headers: { Authorization: 'Basic x' }, body: CONFIRM }),
    ],
  ])('401 for %s, without asking Auth', async (_label, request) => {
    const { handle, identify, deleteUser } = setup();
    const response = await handle(request);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
    expect(identify).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('401 when Auth does not recognise the token (anon key, signed out, expired)', async () => {
    const { handle, deleteUser } = setup({ kind: 'invalid' });
    const response = await handle(post());
    expect(response.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', null],
    ['not JSON', 'DELETE'],
    ['the wrong word', JSON.stringify({ confirm: 'delete' })],
    ['an empty object', '{}'],
    ['an oversized body', JSON.stringify({ confirm: 'DELETE', pad: 'x'.repeat(2000) })],
  ])('400 BAD_REQUEST for %s, before Auth is asked', async (_label, body) => {
    const { handle, identify, deleteUser } = setup();
    const response = await handle(post(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('BAD_REQUEST');
    expect(identify).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('500 INTERNAL when the admin delete fails; logs the status only', async () => {
    const { handle, logs } = setup(undefined, new AuthAdminError('admin delete failed', 503));
    const response = await handle(post());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(logs).toEqual([
      expect.objectContaining({ status: 500, outcome: 'admin_failed', adminStatus: 503 }),
    ]);
  });

  it('405 for GET; 204 with CORS headers for OPTIONS', async () => {
    const { handle, deleteUser } = setup();
    expect((await handle(new Request(URL, { method: 'GET' }))).status).toBe(405);
    const preflight = await handle(new Request(URL, { method: 'OPTIONS' }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('never logs the token or the user id', async () => {
    const { handle, logs } = setup();
    await handle(post());
    const line = JSON.stringify(logs);
    expect(line).not.toContain('user-jwt');
    expect(line).not.toContain(USER_ID);
  });
});
