// AI gateway Edge Function entry point (TB-22, https://stratyge.atlassian.net/browse/TB-22).
// The only place that touches Deno globals and env. Secrets (Edge Function secrets only):
//   ANTHROPIC_API_KEY     provider key; never in the app, never logged
// Optional config:
//   AI_MODEL_CHEAP / AI_MODEL_STRONG   model ids (defaults in config.ts)
//   AI_CALLS_PER_HOUR / AI_TOKENS_PER_DAY  TB-23 free-tier limits (defaults 30 and 50,000)
//   ANTHROPIC_BASE_URL                 local mock only: honoured for http://localhost, 127.0.0.1 or
//                                      host.docker.internal, ignored otherwise
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (TB-23:
// the usage store's RPC calls; server-only, never logged).
import { createSupabaseAuthVerifier } from './auth.ts';
import { loadGatewayConfig } from './config.ts';
import { createGateway } from './gateway.ts';
import { buildMiddleware } from './middleware/index.ts';
import { createAnthropicProvider, localProviderBaseUrl } from './providers/anthropic.ts';
import { createSupabaseUsageStore } from './usage-store.ts';

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

const config = loadGatewayConfig(env);
const log = (entry: object) => console.log(JSON.stringify({ fn: 'ai-gateway', ...entry }));

const handler = createGateway({
  config,
  auth: createSupabaseAuthVerifier({
    supabaseUrl: required('SUPABASE_URL'),
    apiKey: required('SUPABASE_ANON_KEY'),
  }),
  provider: apiKey ? createAnthropicProvider({ apiKey, baseUrl }) : null,
  middleware: buildMiddleware({
    config,
    usageStore: createSupabaseUsageStore({
      supabaseUrl: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    }),
    log,
  }),
  log,
});

deno.serve(handler);
