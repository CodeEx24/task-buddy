// Calls the delete-account Edge Function (TB-53). The function deletes the Auth user with the
// service role; Postgres cascades to every server row the user owns. supabase-js sends the
// signed-in user's access token. Errors are reduced to a kind; bodies are never logged or shown.
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import type { TaskBuddySupabaseClient } from '@/lib/supabase';

import {
  DELETE_ACCOUNT_CONFIRMATION,
  DELETE_ACCOUNT_FUNCTION,
  deleteAccountSuccessSchema,
  type DeleteAccountSuccess,
} from '../../../../packages/schemas/src/delete-account';

export type AccountRemoteErrorKind = 'network' | 'auth' | 'server';

export class AccountRemoteError extends Error {
  readonly kind: AccountRemoteErrorKind;
  constructor(kind: AccountRemoteErrorKind) {
    super(`account deletion failed: ${kind}`);
    this.name = 'AccountRemoteError';
    this.kind = kind;
  }
}

export type AccountRemote = {
  /** Resolves once the server account is gone (`already_deleted` included). */
  deleteAccount(): Promise<DeleteAccountSuccess['status']>;
};

/** Maps a thrown value or a supabase-js FunctionsError to a kind. Exported for tests. */
export function classifyAccountRemoteError(error: unknown): AccountRemoteErrorKind {
  if (error instanceof AccountRemoteError) return error.kind;
  // fetch itself failed: offline, DNS, TLS. Nothing reached the server.
  if (error instanceof FunctionsFetchError || error instanceof TypeError) return 'network';
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as { status?: unknown } | undefined)?.status;
    return status === 401 ? 'auth' : 'server';
  }
  return 'server';
}

export function createAccountRemote(
  functions: Pick<TaskBuddySupabaseClient['functions'], 'invoke'>,
): AccountRemote {
  return {
    async deleteAccount() {
      try {
        const { data, error } = await functions.invoke(DELETE_ACCOUNT_FUNCTION, {
          method: 'POST',
          body: { confirm: DELETE_ACCOUNT_CONFIRMATION },
        });
        if (error) throw new AccountRemoteError(classifyAccountRemoteError(error));
        const parsed = deleteAccountSuccessSchema.safeParse(data);
        if (!parsed.success) throw new AccountRemoteError('server');
        return parsed.data.status;
      } catch (error) {
        throw new AccountRemoteError(classifyAccountRemoteError(error));
      }
    },
  };
}
