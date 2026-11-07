// TB-24 golden set and runner arithmetic (https://stratyge.atlassian.net/browse/TB-24).
import { checkAiOutput } from '../packages/schemas/src/ai-output.ts';

import {
  type CaseResult,
  checkAgainstMock,
  formatSummary,
  loadGoldenSets,
  predictMock,
  summarize,
} from './golden-report.ts';
import {
  DEFAULT_MOCK_MIX,
  extractUserText,
  fnv1a,
  parseMockMix,
  REPAIRABLE_FAULTS,
  repairableAnswer,
  routeFromSystem,
  scenarioFor,
  unusableAnswer,
  validAnswer,
} from './mock-output-mix.ts';

describe('golden set (AC1 inputs)', () => {
  const items = loadGoldenSets();

  it('has exactly 200 cases: 120 parse, 45 breakdown, 35 plan', () => {
    expect(items).toHaveLength(200);
    const count = (route: string) => items.filter((i) => i.route === route).length;
    expect([count('parse'), count('breakdown'), count('plan')]).toEqual([120, 45, 35]);
  });

  it('has unique ids and unique inputs', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.input)).size).toBe(items.length);
  });

  it('covers Taglish/Filipino, injection attempts and no-task inputs', () => {
    const tagged = (tag: string) => items.filter((i) => i.tags.includes(tag)).length;
    expect(tagged('taglish') + tagged('tl') + tagged('ceb')).toBeGreaterThanOrEqual(40);
    expect(tagged('injection')).toBeGreaterThanOrEqual(3);
    expect(tagged('no-task')).toBeGreaterThanOrEqual(1);
  });

  it('contains no personal data patterns (emails, URLs, long digit runs)', () => {
    for (const { id, input } of items) {
      expect([id, /[\w.+-]+@[\w-]+\.\w+/.test(input)]).toEqual([id, false]);
      expect([id, /https?:\/\/|www\./i.test(input)]).toEqual([id, false]);
      expect([id, /\d{10,}/.test(input.replace(/[\s-]/g, ''))]).toEqual([id, false]);
    }
  });
});

const result = (
  id: string,
  outcome: CaseResult['outcome'],
  route: CaseResult['route'] = 'parse',
): CaseResult => ({
  id,
  route,
  status: outcome === 'valid' ? 200 : 502,
  outcome,
  latencyMs: 1,
  tokens: 10,
});

describe('summarize', () => {
  it('computes the rate over all cases and the 98% threshold', () => {
    const passing = [
      ...Array.from({ length: 196 }, (_, i) => result(`p-${i}`, 'valid')),
      result('b-1', 'bad_output'),
      result('b-2', 'bad_output'),
      result('b-3', 'bad_output'),
      result('b-4', 'bad_output'),
    ];
    expect(summarize(passing, 200)).toMatchObject({
      total: 200,
      valid: 196,
      badOutput: 4,
      rate: 0.98,
      meetsAc1: true,
    });
    const failing = [...passing.slice(0, 195), result('e-1', 'error'), ...passing.slice(196)];
    expect(summarize(failing, 200)).toMatchObject({ valid: 195, errors: 1, meetsAc1: false });
  });

  it('counts errors against the rate and lists failing ids only', () => {
    const summary = summarize([result('a', 'valid'), result('b', 'error', 'plan')], 2);
    expect(summary.rate).toBe(0.5);
    expect(summary.byRoute.plan).toMatchObject({ total: 1, errors: 1, rate: 0 });
    expect(summary.failedIds).toEqual(['b']);
    expect(formatSummary(summary)).toContain('AC1 (>= 98.0%): FAIL');
  });

  it('an empty run never meets AC1', () => {
    expect(summarize([], 200).meetsAc1).toBe(false);
  });

  it('a partial run (subset or early stop) never meets AC1, even at 100%', () => {
    const partial = Array.from({ length: 150 }, (_, i) => result(`p-${i}`, 'valid'));
    const summary = summarize(partial, 200);
    expect(summary).toMatchObject({ rate: 1, meetsAc1: false });
    expect(formatSummary(summary)).toContain('AC1: not assessed (ran 150 of 200 golden cases)');
  });
});

describe('mock output mix', () => {
  it('parses and validates MOCK_OUTPUT_MIX', () => {
    expect(parseMockMix('valid=90,repair=9,fail=1')).toEqual(DEFAULT_MOCK_MIX);
    expect(() => parseMockMix('valid=90,repair=9')).toThrow('100');
    expect(() => parseMockMix('valid=99,oops=1')).toThrow('bad mix key');
  });

  it('hashes deterministically', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('buy milk')).toBe(fnv1a('buy milk'));
    expect(scenarioFor('buy milk', { valid: 100, repair: 0, fail: 0 })).toBe('valid');
    expect(scenarioFor('buy milk', { valid: 0, repair: 0, fail: 100 })).toBe('fail');
  });

  it('extracts the user text and route the way the gateway renders them', () => {
    expect(extractUserText('Reference date: x\n\n<user_input>\nbuy milk\n</user_input>')).toBe(
      'buy milk',
    );
    expect(routeFromSystem('{"subtasks":[]}')).toBe('breakdown');
    expect(routeFromSystem('{"blocks":[]}')).toBe('plan');
    expect(routeFromSystem('{"tasks":[]}')).toBe('parse');
  });

  it.each(['parse', 'breakdown', 'plan'] as const)(
    '/%s: valid answers validate; repairable and unusable answers do not',
    (route) => {
      for (const text of [
        'buy milk',
        'lipat bahay',
        'x',
        'ayusin ang thesis',
        'call tita at 3pm',
      ]) {
        expect(checkAiOutput(route, validAnswer(route, text)).ok).toBe(true);
        expect(checkAiOutput(route, repairableAnswer(route, text)).ok).toBe(false);
      }
      expect(checkAiOutput(route, unusableAnswer()).ok).toBe(false);
    },
  );

  it('every repairable fault kind occurs in the golden set', () => {
    const kinds = new Set(
      loadGoldenSets().map(
        (i) => REPAIRABLE_FAULTS[(fnv1a(i.input) >>> 8) % REPAIRABLE_FAULTS.length],
      ),
    );
    expect(kinds.size).toBe(REPAIRABLE_FAULTS.length);
  });
});

describe('predictMock / checkAgainstMock', () => {
  const items = loadGoldenSets();
  const prediction = predictMock(items, DEFAULT_MOCK_MIX);

  it('partitions every case and predicts one repair call per non-valid case', () => {
    expect(prediction.validFirst + prediction.repaired + prediction.badOutput).toBe(200);
    expect(prediction.firstCalls).toBe(200);
    expect(prediction.repairCalls).toBe(prediction.repaired + prediction.badOutput);
  });

  it('accepts a run that matches and reports each mismatch', () => {
    const results = items.map((item, i) =>
      result(
        item.id,
        i < prediction.validFirst + prediction.repaired ? 'valid' : 'bad_output',
        item.route,
      ),
    );
    const summary = summarize(results, 200);
    const stats = { first: prediction.firstCalls, repair: prediction.repairCalls };
    expect(checkAgainstMock(summary, prediction, stats)).toEqual([]);
    expect(checkAgainstMock(summary, prediction, { ...stats, repair: stats.repair + 1 })).toEqual([
      `repair provider calls: measured ${stats.repair + 1}, predicted ${stats.repair}`,
    ]);
  });
});
