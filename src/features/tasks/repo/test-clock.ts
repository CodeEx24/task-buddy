/** Test helper: a controllable `Date.now()` so `updated_at` assertions are exact. */
export function installTestClock(start = 1_800_000_000_000) {
  let now = start;
  let spy: jest.SpyInstance<number, []> | undefined;
  beforeEach(() => {
    now = start;
    spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => spy?.mockRestore());
  return {
    now: () => now,
    advance: (ms = 1000) => {
      now += ms;
      return now;
    },
  };
}
