// Golden-set runner for the AI output contract (TB-24, https://stratyge.atlassian.net/browse/TB-24).
// Sends every case in evals/golden/*.json through the deployed or local ai-gateway, one at a time,
// and reports how many came back schema-valid after at most one repair retry (AC1: >= 98%).
//
//   USER_JWT=<access token> pnpm eval --url <SUPABASE_URL>/functions/v1/ai-gateway [options]
//
// Options:
//   --routes parse,breakdown,plan   subset of routes (default: all)
//   --limit <n>                     first n cases per route
//   --rps <n>                       max requests per second (default 1)
//   --max-requests <n>              hard stop (default 200)
//   --max-tokens <n>                stop once this many tokens were used (default 400000; see below)
//   --mock-stats-url <url>          mock provider's /stats: compare the run with the mock's plan
//   --mock-mix valid=90,repair=9,fail=1   the MOCK_OUTPUT_MIX the mock was started with
//   --out <file>                    write a JSON report (ids, statuses, counts; never text)
//
// Token budget: a 200 reports both calls' usage (summed after a repair); a failed case counts as
// FAILURE_TOKEN_ESTIMATE. The real spend cap is the Anthropic workspace limit (docs/actions).
// Never prints inputs, outputs or the token. Exit 1 when AC1 fails or the mock check mismatches.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { AI_ROUTES, type AiRoute } from '../packages/schemas/src/ai-gateway.ts';
import { checkAiOutput } from '../packages/schemas/src/ai-output.ts';

import {
  type CaseResult,
  checkAgainstMock,
  formatSummary,
  type GoldenItem,
  loadGoldenSets,
  type MockStats,
  predictMock,
  summarize,
} from './golden-report.ts';
import { parseMockMix } from './mock-output-mix.ts';

/** Worst case for a failed request: two calls at the largest route max_tokens, plus input. */
const FAILURE_TOKEN_ESTIMATE = 10_000;

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    routes: { type: 'string' },
    limit: { type: 'string' },
    rps: { type: 'string', default: '1' },
    'max-requests': { type: 'string', default: '200' },
    'max-tokens': { type: 'string', default: '400000' },
    'mock-stats-url': { type: 'string' },
    'mock-mix': { type: 'string' },
    out: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`run-golden: ${message}`);
  process.exit(2);
}

const baseUrl = values.url?.replace(/\/+$/, '') ?? fail('--url is required');
const token = process.env.USER_JWT ?? fail('set USER_JWT to a signed-in user access token');
const positive = (name: string, value: string | undefined): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) fail(`--${name} must be a positive number`);
  return n;
};
const rps = positive('rps', values.rps);
const maxRequests = positive('max-requests', values['max-requests']);
const maxTokens = positive('max-tokens', values['max-tokens']);
const limit = values.limit === undefined ? undefined : positive('limit', values.limit);
const routes = (values.routes?.split(',') ?? [...AI_ROUTES]) as AiRoute[];
for (const route of routes) if (!AI_ROUTES.includes(route)) fail(`unknown route ${route}`);

const golden = loadGoldenSets();
const items: GoldenItem[] = routes.flatMap((route) => {
  const cases = golden.filter((item) => item.route === route);
  return limit === undefined ? cases : cases.slice(0, limit);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockStats(url: string): Promise<MockStats> {
  const response = await fetch(url);
  const body = (await response.json()) as MockStats;
  return { first: body.first, repair: body.repair };
}

async function runCase(item: GoldenItem): Promise<CaseResult> {
  const started = Date.now();
  const base = { id: item.id, route: item.route };
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${item.route}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: item.input }),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    return {
      ...base,
      status: 0,
      outcome: 'error',
      errorCode: `NETWORK_${name}`,
      latencyMs: Date.now() - started,
      tokens: FAILURE_TOKEN_ESTIMATE,
    };
  }
  const latencyMs = Date.now() - started;
  const body = (await response.json().catch(() => null)) as {
    output?: unknown;
    usage?: { inputTokens: number; outputTokens: number };
    error?: { code?: string };
  } | null;
  if (response.status === 200 && typeof body?.output === 'string') {
    const tokens = (body.usage?.inputTokens ?? 0) + (body.usage?.outputTokens ?? 0);
    // The client's own boundary check: the app validates `output` again before using it.
    const check = checkAiOutput(item.route, body.output);
    return check.ok
      ? { ...base, status: 200, outcome: 'valid', latencyMs, tokens }
      : { ...base, status: 200, outcome: 'error', errorCode: 'CLIENT_INVALID', latencyMs, tokens };
  }
  const errorCode = body?.error?.code ?? 'UNKNOWN';
  return {
    ...base,
    status: response.status,
    outcome: errorCode === 'AI_BAD_OUTPUT' ? 'bad_output' : 'error',
    errorCode,
    latencyMs,
    tokens: FAILURE_TOKEN_ESTIMATE,
  };
}

async function main() {
  const statsUrl = values['mock-stats-url'];
  const before = statsUrl ? await mockStats(statsUrl) : undefined;
  const results: CaseResult[] = [];
  let tokens = 0;
  let stopped: string | undefined;
  const interval = 1000 / rps;

  for (const item of items) {
    if (results.length >= maxRequests) {
      stopped = `max-requests ${maxRequests}`;
      break;
    }
    if (tokens >= maxTokens) {
      stopped = `max-tokens ${maxTokens}`;
      break;
    }
    const started = Date.now();
    const result = await runCase(item);
    results.push(result);
    tokens += result.tokens;
    if (result.outcome !== 'valid') console.log(`${item.id}: ${result.status} ${result.errorCode}`);
    await sleep(Math.max(0, interval - (Date.now() - started)));
  }

  const summary = summarize(results, golden.length);
  console.log(formatSummary(summary));
  if (stopped)
    console.log(`stopped early at ${stopped} after ${results.length}/${items.length} cases`);

  let mockProblems: string[] = [];
  if (statsUrl && before) {
    const after = await mockStats(statsUrl);
    const delta = { first: after.first - before.first, repair: after.repair - before.repair };
    const prediction = predictMock(
      items.slice(0, results.length),
      parseMockMix(values['mock-mix'] ?? fail('--mock-mix is required with --mock-stats-url')),
    );
    mockProblems = checkAgainstMock(summary, prediction, delta);
    console.log(
      `mock prediction: ${prediction.validFirst} valid first try, ${prediction.repaired} repaired, ${prediction.badOutput} AI_BAD_OUTPUT; ` +
        `provider calls predicted ${prediction.firstCalls} + ${prediction.repairCalls} repair, measured ${delta.first} + ${delta.repair} repair`,
    );
    console.log(
      mockProblems.length
        ? `mock check: MISMATCH\n  ${mockProblems.join('\n  ')}`
        : 'mock check: measured = predicted',
    );
  }

  if (values.out) {
    writeFileSync(
      values.out,
      `${JSON.stringify({ summary, stopped: stopped ?? null, results }, null, 2)}\n`,
    );
  }
  // With the mock, a deliberately low mix is expected to miss AC1; only a mismatch fails the run.
  process.exit(mockProblems.length || (!statsUrl && !summary.meetsAc1) ? 1 : 0);
}

void main();
