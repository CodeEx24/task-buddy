// TB-53 AC2: the delete flow (server → owe a local wipe → sign out) and the remote's error mapping.
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

import {
  AccountRemoteError,
  classifyAccountRemoteError,
  createAccountRemote,
  type AccountRemote,
} from '../remote/account-remote';
import { deleteAccount } from './delete-account';

const USER_ID = '0190f3b2-0000-7000-8000-00000000a001';

function deps(remote: AccountRemote) {
  const order: string[] = [];
  const signOut = jest.fn(async () => {
    order.push('signOut');
  });
  const markForWipe = jest.fn(async (_userId: string) => {
    order.push('markForWipe');
  });
  const deleteExports = jest.fn(async () => {
    order.push('deleteExports');
  });
  const wrapped: AccountRemote = {
    deleteAccount: async () => {
      order.push('server');
      return remote.deleteAccount();
    },
  };
  return {
    deps: { remote: wrapped, signOut, markForWipe, deleteExports },
    signOut,
    markForWipe,
    deleteExports,
    order,
  };
}

const okRemote: AccountRemote = { deleteAccount: async () => 'deleted' };
const failingRemote = (kind: 'network' | 'auth' | 'server'): AccountRemote => ({
  deleteAccount: async () => {
    throw new AccountRemoteError(kind);
  },
});
const SUCCESS_ORDER = ['server', 'markForWipe', 'signOut', 'deleteExports'];

describe('deleteAccount', () => {
  it('server delete → owe a local wipe → sign out → remove exports, in that order', async () => {
    const { deps: d, markForWipe, order } = deps(okRemote);
    await expect(deleteAccount(USER_ID, d)).resolves.toEqual({ ok: true });
    expect(order).toEqual(SUCCESS_ORDER);
    expect(markForWipe).toHaveBeenCalledWith(USER_ID);
  });

  it('an already-deleted account (retry after a lost reply) still ends signed out and wiped', async () => {
    const { deps: d, order } = deps({ deleteAccount: async () => 'already_deleted' });
    await expect(deleteAccount(USER_ID, d)).resolves.toEqual({ ok: true });
    expect(order).toEqual(SUCCESS_ORDER);
  });

  it.each([
    ['network', 'offline'],
    ['auth', 'session'],
    ['server', 'failed'],
  ] as const)(
    'a %s error → %s; nothing else happens (not queued, still signed in, data kept)',
    async (kind, reason) => {
      const { deps: d, signOut, markForWipe, deleteExports } = deps(failingRemote(kind));
      await expect(deleteAccount(USER_ID, d)).resolves.toEqual({ ok: false, reason });
      expect(signOut).not.toHaveBeenCalled();
      expect(markForWipe).not.toHaveBeenCalled();
      expect(deleteExports).not.toHaveBeenCalled();
    },
  );
});

describe('createAccountRemote', () => {
  function remoteFor(result: { data: unknown; error: unknown } | Error) {
    const invoke = jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    return { remote: createAccountRemote({ invoke } as never), invoke };
  }

  it('POSTs { confirm: "DELETE" } to delete-account and returns the status', async () => {
    const { remote, invoke } = remoteFor({
      data: { requestId: 'r', status: 'deleted' },
      error: null,
    });
    await expect(remote.deleteAccount()).resolves.toBe('deleted');
    expect(invoke).toHaveBeenCalledWith('delete-account', {
      method: 'POST',
      body: { confirm: 'DELETE' },
    });
  });

  it.each([
    [
      'offline (fetch failed)',
      new FunctionsFetchError(new TypeError('Network request failed')),
      'network',
    ],
    ['401', new FunctionsHttpError(new Response('{}', { status: 401 })), 'auth'],
    ['500', new FunctionsHttpError(new Response('{}', { status: 500 })), 'server'],
    ['relay error', new FunctionsRelayError({}), 'server'],
  ])('maps %s to %s', async (_label, error, kind) => {
    const { remote } = remoteFor({ data: null, error });
    await expect(remote.deleteAccount()).rejects.toMatchObject({ kind });
  });

  it('an unexpected 200 body is a server error (never assumed deleted)', async () => {
    const { remote } = remoteFor({ data: { ok: true }, error: null });
    await expect(remote.deleteAccount()).rejects.toMatchObject({ kind: 'server' });
  });

  it('a thrown TypeError (fetch itself) is a network error', async () => {
    const { remote } = remoteFor(new TypeError('Network request failed'));
    await expect(remote.deleteAccount()).rejects.toMatchObject({ kind: 'network' });
    expect(classifyAccountRemoteError(new Error('x'))).toBe('server');
  });
});
