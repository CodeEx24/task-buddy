// Account deletion wire contract (TB-53, https://stratyge.atlassian.net/browse/TB-53).
// Shared by the app's account client and `supabase/functions/delete-account`. Runtime-agnostic:
// imports only `zod`, which Node resolves from node_modules and Deno through the function's deno.json.
import { z } from 'zod';

/** The function URL is `<SUPABASE_URL>/functions/v1/delete-account` (POST). */
export const DELETE_ACCOUNT_FUNCTION = 'delete-account';

/** The exact word the request must carry, so no other caller can trigger a deletion by accident. */
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';

export const deleteAccountRequestSchema = z.strictObject({
  confirm: z.literal(DELETE_ACCOUNT_CONFIRMATION),
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

/**
 * 200 body. `deleted`: this call removed the account. `already_deleted`: the token is a validly
 * signed session of an account that no longer exists (an earlier call succeeded but its reply was
 * lost), so a retry is safe and ends in the same state.
 */
export const deleteAccountSuccessSchema = z.object({
  requestId: z.string(),
  status: z.enum(['deleted', 'already_deleted']),
});
export type DeleteAccountSuccess = z.infer<typeof deleteAccountSuccessSchema>;

export const DELETE_ACCOUNT_ERROR_CODES = [
  'UNAUTHENTICATED',
  'METHOD_NOT_ALLOWED',
  'BAD_REQUEST',
  'INTERNAL',
] as const;
export type DeleteAccountErrorCode = (typeof DELETE_ACCOUNT_ERROR_CODES)[number];

export const deleteAccountErrorSchema = z.object({
  requestId: z.string(),
  error: z.object({ code: z.enum(DELETE_ACCOUNT_ERROR_CODES), message: z.string() }),
});
export type DeleteAccountError = z.infer<typeof deleteAccountErrorSchema>;
