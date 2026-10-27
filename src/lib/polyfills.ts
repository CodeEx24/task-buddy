// Runtime polyfills, installed once on import (TB-21). Import this module before anything that
// needs `crypto.getRandomValues` (`@/lib/ids` does so itself).
import { getRandomValues } from 'expo-crypto';

type RandomValuesFn = <T extends ArrayBufferView | null>(array: T) => T;
type CryptoHost = { crypto?: { getRandomValues?: RandomValuesFn } };

declare global {
  // Read by the `uuidv7` package: throw instead of silently falling back to Math.random().
  var UUIDV7_DENY_WEAK_RNG: boolean | undefined;
}

/** Gives `host.crypto.getRandomValues` a CSPRNG (expo-crypto) when the runtime lacks one. */
export function installCryptoPolyfill(
  host: CryptoHost,
  source: RandomValuesFn = getRandomValues as RandomValuesFn,
): void {
  if (typeof host.crypto?.getRandomValues === 'function') return;
  const current = host.crypto ?? {};
  current.getRandomValues = source;
  host.crypto = current;
}

globalThis.UUIDV7_DENY_WEAK_RNG = true;
installCryptoPolyfill(globalThis as unknown as CryptoHost);
