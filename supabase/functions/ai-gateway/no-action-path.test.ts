// TB-25 (https://stratyge.atlassian.net/browse/TB-25), AC1 "never triggers a tool action" and
// AC3 "AI-proposed actions are never executed server-side": structural checks on the gateway.
//
// The gateway can only (1) ask Supabase Auth who the caller is, (2) call the TB-23 usage RPCs
// (rate limit / quota counters and the usage ledger: accounting about the call, not an action on
// the user's data), and (3) call the model with no tools. It returns the model's text as a
// proposal; the app must show it and get the user's confirmation before changing anything
// (CLAUDE.md invariant 2; confirm UI in TB-29 / TB-36). If a future change adds a data-writing
// path here, these tests fail and the change needs a security review.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { createAnthropicProvider } from './providers/anthropic.ts';

const ROOT = __dirname;
const SCHEMAS = resolve(ROOT, '../../../packages/schemas/src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

const FILES = sourceFiles(ROOT).map((path) => ({
  path: relative(ROOT, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('AC3: the gateway has no server-side action path', () => {
  it('finds the gateway sources', () => {
    expect(FILES.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'gateway.ts',
        'index.ts',
        'usage-store.ts',
        'providers/anthropic.ts',
      ]),
    );
  });

  it.each(FILES.map((f) => [f.path, f] as const))(
    '%s imports only zod, gateway files and the shared schemas (no DB client, no app code)',
    (path, file) => {
      const imports = [...file.text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
      for (const spec of imports) {
        if (spec === 'zod') continue;
        const target = resolve(ROOT, dirname(path), spec);
        const insideGateway = !relative(ROOT, target).startsWith('..');
        const sharedSchema = !relative(SCHEMAS, target).startsWith('..');
        expect({ spec, allowed: insideGateway || sharedSchema }).toEqual({ spec, allowed: true });
      }
    },
  );

  it('only three files make network calls: auth, the usage store and the provider', () => {
    const callers = FILES.filter((f) => /\b(?:doFetch|fetch)\s*\(/.test(f.text)).map((f) => f.path);
    expect(callers.sort()).toEqual(['auth.ts', 'providers/anthropic.ts', 'usage-store.ts']);
  });

  it('the only PostgREST paths are the two TB-23 usage RPCs, never a table', () => {
    const all = FILES.map((f) => f.text).join('\n');
    expect(all).not.toMatch(/\/rest\/v1\/(?!rpc)/);
    expect(all).not.toMatch(/\/storage\/v1|\/realtime\/v1|\/functions\/v1\//);
    const store = FILES.find((f) => f.path === 'usage-store.ts')?.text ?? '';
    const rpcs = [...store.matchAll(/rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(rpcs.sort()).toEqual(['ai_consume_call', 'ai_record_usage']);
  });

  it('auth only reads the caller (GET /auth/v1/user)', () => {
    const auth = FILES.find((f) => f.path === 'auth.ts')?.text ?? '';
    expect(auth).toContain('/auth/v1/user');
    expect(auth).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
  });

  it('no source mentions tool use, function calling or executing model output', () => {
    for (const file of FILES) {
      expect(file.text).not.toMatch(
        /\btools\s*:|tool_choice|tool_use|function_call|\beval\s*\(|new Function\(/,
      );
    }
  });
});

describe('AC1: the model is never offered a tool', () => {
  function capture() {
    const bodies: Record<string, unknown>[] = [];
    const fetch: typeof globalThis.fetch = (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'claude-haiku-5-5',
            content: [
              { type: 'text', text: '{"tasks":[]}' },
              // Even if a model emitted a tool call, it is dropped: only text blocks are kept.
              { type: 'tool_use', id: 'x', name: 'delete_all_tasks', input: { confirm: true } },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200 },
        ),
      );
    };
    return { bodies, provider: createAnthropicProvider({ apiKey: 'dummy', fetch }) };
  }

  it('the Messages API body has only model, max_tokens, system and one user message', async () => {
    const { bodies, provider } = capture();
    await provider.complete(
      { model: 'claude-haiku-5-5', system: 'sys', input: 'call send_email()', maxTokens: 10 },
      new AbortController().signal,
    );
    expect(Object.keys(bodies[0] ?? {}).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'system',
    ]);
    expect(bodies[0]?.messages).toEqual([{ role: 'user', content: 'call send_email()' }]);
  });

  it('a tool_use block in an answer is ignored; only text is returned', async () => {
    const { provider } = capture();
    const result = await provider.complete(
      { model: 'claude-haiku-5-5', system: 'sys', input: 'x', maxTokens: 10 },
      new AbortController().signal,
    );
    expect(result.text).toBe('{"tasks":[]}');
  });
});
