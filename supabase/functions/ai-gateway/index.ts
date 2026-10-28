// AI gateway Edge Function entry point (TB-22, https://stratyge.atlassian.net/browse/TB-22).
// The only place that touches Deno globals and env. Secrets (Edge Function secrets only):
//   ANTHROPIC_API_KEY     provider key; never in the app, never logged
// Optional config:
//   AI_MODEL_CHEAP / AI_MODEL_STRONG   model ids (defaults in config.ts)
//   ANTHROPIC_BASE_URL                 local mock only: honoured for http://localhost, 127.0.0.1 or
//                                      host.docker.internal, ignored otherwise
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY.
import { createSupabaseAuthVerifier } from './auth.ts';
import { loadGatewayConfig } from './config.ts';
import { createGateway } from './gateway.ts';
import { MIDDLEWARE } from './middleware/index.ts';
import { createAnthropicProvider, localProviderBaseUrl } from './providers/anthropic.ts';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

// Typed locally so the app's `tsc` (Node types) can check this file without Deno's lib.
const deno = (globalThis as unknown as { Deno: DenoRuntime }).Deno;
const env = (name: string) => deno.env.get(name);

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`ai-gateway: missing ${name}`);
  return value;
}

const apiKey = env('ANTHROPIC_API_KEY');
const baseUrl = localProviderBaseUrl(env('ANTHROPIC_BASE_URL'));

const handler = createGateway({
  config: loadGatewayConfig(env),
  auth: createSupabaseAuthVerifier({
    supabaseUrl: required('SUPABASE_URL'),
    apiKey: required('SUPABASE_ANON_KEY'),
  }),
  provider: apiKey ? createAnthropicProvider({ apiKey, baseUrl }) : null,
  middleware: MIDDLEWARE,
  log: (entry) => console.log(JSON.stringify({ fn: 'ai-gateway', ...entry })),
});

deno.serve(handler);
