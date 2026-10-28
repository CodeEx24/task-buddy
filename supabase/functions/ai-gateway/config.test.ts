// TB-23 (https://stratyge.atlassian.net/browse/TB-23): usage limits from env and the cost estimate.
import {
  DEFAULT_USAGE_LIMITS,
  estimateCostUsd,
  FALLBACK_PRICE,
  loadGatewayConfig,
  MODEL_PRICES_USD_PER_MTOK,
  priceForModel,
} from './config.ts';

const fromEnv = (values: Record<string, string>) => loadGatewayConfig((name) => values[name]);

describe('usage limits', () => {
  it('defaults to 30 calls per hour and 50,000 tokens per day (free tier)', () => {
    expect(fromEnv({}).limits).toEqual({ callsPerHour: 30, tokensPerDay: 50_000 });
    expect(DEFAULT_USAGE_LIMITS).toEqual({ callsPerHour: 30, tokensPerDay: 50_000 });
  });

  it('takes positive integer overrides from AI_CALLS_PER_HOUR / AI_TOKENS_PER_DAY', () => {
    expect(fromEnv({ AI_CALLS_PER_HOUR: ' 5 ', AI_TOKENS_PER_DAY: '1000' }).limits).toEqual({
      callsPerHour: 5,
      tokensPerDay: 1000,
    });
  });

  it.each(['0', '-3', '2.5', 'abc', '', '1e3', '99999999999999999999'])(
    'ignores an invalid override %p and keeps the default',
    (value) => {
      expect(fromEnv({ AI_CALLS_PER_HOUR: value, AI_TOKENS_PER_DAY: value }).limits).toEqual(
        DEFAULT_USAGE_LIMITS,
      );
    },
  );
});

describe('estimateCostUsd (an estimate from the price table)', () => {
  it('prices the default models per million tokens', () => {
    // Haiku 5.5: $0.10 in / $0.50 out → 1M in + 1M out = $0.60
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 1e6, outputTokens: 1e6 })).toBe(0.6);
    // Sonnet 5.5: $2 in / $10 out → 1,000 in + 500 out = $0.002 + $0.005
    expect(estimateCostUsd('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 })).toBe(
      0.007,
    );
  });

  it('rounds to 6 decimals (the ledger column scale)', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 3, outputTokens: 1 })).toBe(0.000001);
  });

  it('is zero for zero tokens', () => {
    expect(estimateCostUsd('claude-sonnet-5-5', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it('costs an unknown model at the dearest known price (never under-estimates)', () => {
    const dearest = Math.max(
      ...Object.values(MODEL_PRICES_USD_PER_MTOK).map((p) => p.input + p.output),
    );
    expect(FALLBACK_PRICE.input + FALLBACK_PRICE.output).toBe(dearest);
    expect(estimateCostUsd('some-future-model', { inputTokens: 1e6, outputTokens: 0 })).toBe(
      FALLBACK_PRICE.input,
    );
  });

  it('prices a dated snapshot id by its longest known prefix', () => {
    expect(priceForModel('claude-haiku-4-5-20251001')).toEqual({ input: 1, output: 5 });
    expect(priceForModel('claude-sonnet-5-5-20261001')).toEqual({ input: 2, output: 10 });
    // `claude-sonnet-5` must not swallow `claude-sonnet-5-5`
    expect(priceForModel('claude-sonnet-5-5')).toEqual({ input: 2, output: 10 });
    expect(priceForModel('claude-haiku-5-55')).toBe(FALLBACK_PRICE);
  });

  it('has a price for both default models', () => {
    const { models } = fromEnv({});
    expect(MODEL_PRICES_USD_PER_MTOK[models.cheap]).toBeDefined();
    expect(MODEL_PRICES_USD_PER_MTOK[models.strong]).toBeDefined();
  });
});
