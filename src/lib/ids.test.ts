import { newId } from './ids';
import { installCryptoPolyfill } from './polyfills';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns RFC 9562 UUIDv7 strings', () => {
    expect(newId()).toMatch(UUID_V7);
  });

  it('is unique and time-ordered', () => {
    const ids = Array.from({ length: 2000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('forbids the weak Math.random fallback', () => {
    expect(globalThis.UUIDV7_DENY_WEAK_RNG).toBe(true);
  });
});

describe('installCryptoPolyfill', () => {
  it('installs getRandomValues when the runtime has no crypto', () => {
    const source = jest.fn(<T>(array: T) => array);
    const host: Parameters<typeof installCryptoPolyfill>[0] = {};
    installCryptoPolyfill(host, source);
    const buffer = new Uint32Array(4);
    host.crypto?.getRandomValues?.(buffer);
    expect(source).toHaveBeenCalledWith(buffer);
  });

  it('keeps an existing getRandomValues', () => {
    const existing = jest.fn(<T>(array: T) => array);
    const host = { crypto: { getRandomValues: existing } };
    installCryptoPolyfill(host, jest.fn());
    expect(host.crypto.getRandomValues).toBe(existing);
  });
});
