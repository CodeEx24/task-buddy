// Golden-set loading and scoring for the AI output contract (TB-24,
// https://stratyge.atlassian.net/browse/TB-24). Pure functions; evals/run-golden.ts does the I/O.
// AC1: at least 98% of golden inputs must come back schema-valid after at most one repair retry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { AI_ROUTES, type AiRoute, MAX_AI_INPUT_CHARS } from '../packages/schemas/src/ai-gateway.ts';

import { expectedOutcome, type MockMix, scenarioFor } from './mock-output-mix.ts';

export const AC1_MIN_RATE = 0.98;
/** Relative to the repo root, where `pnpm eval` runs. */
export const GOLDEN_DIR = join(process.cwd(), 'evals', 'golden');

export const goldenCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+-\d{3}$/),
  input: z.string().min(1).max(MAX_AI_INPUT_CHARS),
  tags: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).min(1),
});
export type GoldenCase = z.infer<typeof goldenCaseSchema>;

export const goldenFileSchema = z.strictObject({
  route: z.enum(AI_ROUTES),
  version: z.literal(1),
  description: z.string(),
  cases: z.array(goldenCaseSchema).min(1),
});
export type GoldenFile = z.infer<typeof goldenFileSchema>;

export type GoldenItem = GoldenCase & { route: AiRoute };

/** All golden cases, route by route, validated. */
export function loadGoldenSets(dir: string = GOLDEN_DIR): GoldenItem[] {
  return AI_ROUTES.flatMap((route) => {
    const file = goldenFileSchema.parse(
      JSON.parse(readFileSync(join(dir, `${route}.json`), 'utf8')),
    );
    if (file.route !== route) throw new Error(`${route}.json declares route ${file.route}`);
    return file.cases.map((c) => ({ ...c, route }));
  });
}

/** What the gateway did with one case. `error` is anything other than 200 or AI_BAD_OUTPUT. */
export type CaseOutcome = 'valid' | 'bad_output' | 'error';

export type CaseResult = {
  id: string;
  route: AiRoute;
  status: number;
  outcome: CaseOutcome;
  /** Error code from the gateway body, or `CLIENT_INVALID` when a 200 failed our own check. */
  errorCode?: string;
  latencyMs: number;
  tokens: number;
};

export type Tally = {
  total: number;
  valid: number;
  badOutput: number;
  errors: number;
  rate: number;
};

export type Summary = Tally & {
  byRoute: Record<AiRoute, Tally>;
  /** Golden cases a complete run must cover (all of evals/golden). */
  expectedTotal: number;
  /** Only a complete run (every golden case answered) can meet AC1. */
  meetsAc1: boolean;
  /** Ids (never inputs) of the cases that did not validate. */
  failedIds: string[];
  tokens: number;
};

function tally(results: readonly CaseResult[]): Tally {
  const valid = results.filter((r) => r.outcome === 'valid').length;
  const badOutput = results.filter((r) => r.outcome === 'bad_output').length;
  const total = results.length;
  return {
    total,
    valid,
    badOutput,
    errors: total - valid - badOutput,
    rate: total ? valid / total : 0,
  };
}

/**
 * Rate = valid / all cases run. Errors count against the rate: an unanswered case is not a pass.
 * AC1 is met only when the run covered all `expectedTotal` golden cases: a subset (--routes,
 * --limit) or a run stopped early by a cap never reports PASS.
 */
export function summarize(results: readonly CaseResult[], expectedTotal: number): Summary {
  const byRoute = Object.fromEntries(
    AI_ROUTES.map((route) => [route, tally(results.filter((r) => r.route === route))]),
  ) as Record<AiRoute, Tally>;
  const all = tally(results);
  return {
    ...all,
    byRoute,
    expectedTotal,
    meetsAc1: all.total > 0 && all.total === expectedTotal && all.rate >= AC1_MIN_RATE,
    failedIds: results.filter((r) => r.outcome !== 'valid').map((r) => r.id),
    tokens: results.reduce((sum, r) => sum + r.tokens, 0),
  };
}

export type MockPrediction = {
  validFirst: number;
  repaired: number;
  badOutput: number;
  /** Provider calls the mock should see: one per case plus one per repair. */
  firstCalls: number;
  repairCalls: number;
};

/** What the mock provider will do for these cases under `mix` (same hash as the mock). */
export function predictMock(items: readonly GoldenItem[], mix: MockMix): MockPrediction {
  const outcomes = items.map((item) => expectedOutcome(scenarioFor(item.input, mix)));
  const validFirst = outcomes.filter((o) => o === 'valid').length;
  const repaired = outcomes.filter((o) => o === 'repaired').length;
  const badOutput = outcomes.filter((o) => o === 'bad_output').length;
  return {
    validFirst,
    repaired,
    badOutput,
    firstCalls: items.length,
    repairCalls: repaired + badOutput,
  };
}

export type MockStats = { first: number; repair: number };

/** Mismatches between a mock run and its prediction; empty means the arithmetic checks out. */
export function checkAgainstMock(
  summary: Summary,
  prediction: MockPrediction,
  stats: MockStats,
): string[] {
  const problems: string[] = [];
  const expect = (label: string, actual: number, expected: number) => {
    if (actual !== expected) problems.push(`${label}: measured ${actual}, predicted ${expected}`);
  };
  expect('valid responses', summary.valid, prediction.validFirst + prediction.repaired);
  expect('AI_BAD_OUTPUT responses', summary.badOutput, prediction.badOutput);
  expect('other errors', summary.errors, 0);
  expect('first provider calls', stats.first, prediction.firstCalls);
  expect('repair provider calls', stats.repair, prediction.repairCalls);
  if (stats.repair > stats.first) problems.push('more repair calls than requests');
  return problems;
}

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/** Human-readable report. Contains counts and case ids only, never inputs or outputs. */
export function formatSummary(summary: Summary): string {
  const lines = [
    `golden cases: ${summary.total}`,
    `valid after <= 1 repair: ${summary.valid}/${summary.total} (${pct(summary.rate)})`,
    `AI_BAD_OUTPUT: ${summary.badOutput}, other errors: ${summary.errors}, tokens reported: ${summary.tokens}`,
    ...AI_ROUTES.map((route) => {
      const t = summary.byRoute[route];
      return `  /${route}: ${t.valid}/${t.total} (${pct(t.rate)}), bad ${t.badOutput}, errors ${t.errors}`;
    }),
    summary.total === summary.expectedTotal
      ? `AC1 (>= ${pct(AC1_MIN_RATE)}): ${summary.meetsAc1 ? 'PASS' : 'FAIL'}`
      : `AC1: not assessed (ran ${summary.total} of ${summary.expectedTotal} golden cases)`,
  ];
  if (summary.failedIds.length) lines.push(`not valid: ${summary.failedIds.join(', ')}`);
  return lines.join('\n');
}
