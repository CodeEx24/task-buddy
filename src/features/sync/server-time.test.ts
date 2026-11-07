import { compareServerTimestamps, parseServerTimestamp, serverTimestampMinus } from './server-time';

describe('server timestamps (pull cursor)', () => {
  it('parses Postgres timestamptz text to microseconds', () => {
    expect(parseServerTimestamp('1970-01-01T00:00:01.000001+00:00')).toBe(1_000_001);
    expect(parseServerTimestamp('1970-01-01T00:00:01.5Z')).toBe(1_500_000);
    expect(parseServerTimestamp('1970-01-01 02:00:01+02')).toBe(1_000_000);
    expect(parseServerTimestamp('not a time')).toBeNull();
  });

  it('orders by value, not by how many fraction digits were printed', () => {
    const a = '2026-10-28T18:17:51.9327+00:00';
    const b = '2026-10-28T18:17:51.93273+00:00';
    expect(compareServerTimestamps(a, b)).toBeLessThan(0);
    expect(
      compareServerTimestamps('2026-10-28T18:17:51.5+00:00', '2026-10-28T18:17:51.500000+00:00'),
    ).toBe(0);
    expect(compareServerTimestamps('2026-10-28T18:17:52+00:00', b)).toBeGreaterThan(0);
  });

  it('moves a timestamp back for the overlap window', () => {
    expect(serverTimestampMinus('2026-10-28T18:17:51.932733+00:00', 10_000)).toBe(
      '2026-10-28T18:17:41.932Z',
    );
  });
});
