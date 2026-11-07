// delete-account request handler (TB-53, https://stratyge.atlassian.net/browse/TB-53).
// Runtime-agnostic (web-standard Request/Response only): index.ts wires it to Deno.serve and the
// Jest suite drives it with fake identity and admin clients.
//
// POST with the user's own access token and `{ "confirm": "DELETE" }`:
//   live user        → hard-delete the Auth user (Postgres cascades every owned row) → 200 deleted
//   deleted user     → 200 already_deleted (a retry after a lost reply; nothing left to do)
//   anything else    → 401; Auth or the admin call failing → 500 INTERNAL (retry is safe)
// A user can only ever delete the account the token belongs to: the id comes from Auth, never
// from the request.
import {
  type DeleteAccountErrorCode,
  type DeleteAccountSuccess,
  deleteAccountRequestSchema,
} from '../../../packages/schemas/src/delete-account.ts';
import { bearerToken } from '../ai-gateway/auth.ts';

import type { AccountIdentifier } from './account-auth.ts';
import { AuthAdminError, type AuthAdmin } from './auth-admin.ts';

export const FUNCTION_NAME = 'delete-account';

/** Bodies are tiny; anything larger is refused before parsing. */
const MAX_BODY_BYTES = 1024;

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Request-Id',
};

const STATUS_BY_CODE: Readonly<Record<DeleteAccountErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  METHOD_NOT_ALLOWED: 405,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

const MESSAGE_BY_CODE: Readonly<Record<DeleteAccountErrorCode, string>> = {
  UNAUTHENTICATED: 'A valid signed-in session is required.',
  METHOD_NOT_ALLOWED: 'Use POST.',
  BAD_REQUEST: 'The request body is invalid.',
  INTERNAL: 'The account could not be deleted. Nothing was lost; try again.',
};

/** One line per request. Never the token, the user id, the email or a response body. */
export type DeleteAccountLogEntry = {
  requestId: string;
  status: number;
  outcome:
    | 'deleted'
    | 'already_deleted'
    | 'race_already_deleted'
    | 'unauthenticated'
    | 'bad_request'
    | 'method_not_allowed'
    | 'admin_failed';
  durationMs: number;
  adminStatus?: number;
};

export type DeleteAccountDeps = {
  identity: AccountIdentifier;
  admin: AuthAdmin;
  log?: (entry: DeleteAccountLogEntry) => void;
  now?: () => number;
  newRequestId?: () => string;
};

function json(status: number, requestId: string, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(requestId: string, code: DeleteAccountErrorCode): Response {
  return json(STATUS_BY_CODE[code], requestId, {
    requestId,
    error: { code, message: MESSAGE_BY_CODE[code] },
  });
}

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return undefined;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createDeleteAccountHandler(deps: DeleteAccountDeps) {
  const now = deps.now ?? (() => Date.now());
  const newRequestId = deps.newRequestId ?? (() => crypto.randomUUID());
  const log = deps.log ?? (() => {});

  return async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS_HEADERS });

    const requestId = newRequestId();
    const startedAt = now();
    const finish = (
      response: Response,
      outcome: DeleteAccountLogEntry['outcome'],
      extra: Partial<DeleteAccountLogEntry> = {},
    ) => {
      log({ requestId, status: response.status, outcome, durationMs: now() - startedAt, ...extra });
      return response;
    };

    if (request.method !== 'POST') {
      return finish(errorResponse(requestId, 'METHOD_NOT_ALLOWED'), 'method_not_allowed');
    }

    // Auth first, so an anonymous caller learns nothing about the body rules.
    const token = bearerToken(request.headers.get('Authorization'));
    if (!token) return finish(errorResponse(requestId, 'UNAUTHENTICATED'), 'unauthenticated');

    if (!deleteAccountRequestSchema.safeParse(await readBody(request)).success) {
      return finish(errorResponse(requestId, 'BAD_REQUEST'), 'bad_request');
    }

    const identity = await deps.identity.identify(token);
    if (identity.kind === 'invalid') {
      return finish(errorResponse(requestId, 'UNAUTHENTICATED'), 'unauthenticated');
    }
    if (identity.kind === 'deleted') {
      const body: DeleteAccountSuccess = { requestId, status: 'already_deleted' };
      return finish(json(200, requestId, body), 'already_deleted');
    }

    try {
      const result = await deps.admin.deleteUser(identity.id);
      const status = result === 'deleted' ? 'deleted' : 'already_deleted';
      const body: DeleteAccountSuccess = { requestId, status };
      return finish(
        json(200, requestId, body),
        result === 'deleted' ? 'deleted' : 'race_already_deleted',
      );
    } catch (error) {
      const adminStatus = error instanceof AuthAdminError ? error.status : undefined;
      return finish(errorResponse(requestId, 'INTERNAL'), 'admin_failed', {
        ...(adminStatus !== undefined ? { adminStatus } : {}),
      });
    }
  };
}
