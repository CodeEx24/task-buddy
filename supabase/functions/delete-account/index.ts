// delete-account Edge Function entry point (TB-53, https://stratyge.atlassian.net/browse/TB-53).
// The only place that touches Deno globals and env. No secrets of its own; auto-injected by
// Supabase: SUPABASE_URL, SUPABASE_ANON_KEY (identifies the caller) and SUPABASE_SERVICE_ROLE_KEY
// (the Auth admin delete; server-only, never logged).
import { createSupabaseAccountIdentifier } from './account-auth.ts';
import { createSupabaseAuthAdmin } from './auth-admin.ts';
import { createDeleteAccountHandler } from './handler.ts';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

// Typed locally so the app's `tsc` (Node types) can check this file without Deno's lib.
const deno = (globalThis as unknown as { Deno: DenoRuntime }).Deno;

function required(name: string): string {
  const value = deno.env.get(name);
  if (!value) throw new Error(`delete-account: missing ${name}`);
  return value;
}

const supabaseUrl = required('SUPABASE_URL');

const handler = createDeleteAccountHandler({
  identity: createSupabaseAccountIdentifier({ supabaseUrl, apiKey: required('SUPABASE_ANON_KEY') }),
  admin: createSupabaseAuthAdmin({
    supabaseUrl,
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  }),
  log: (entry) => console.log(JSON.stringify({ fn: 'delete-account', ...entry })),
});

deno.serve(handler);
