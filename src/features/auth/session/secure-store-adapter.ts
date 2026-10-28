// supabase-js session storage backed by expo-secure-store, split into chunks (TB-20, spec D1-A).
// A session JSON is often over 2 KB and some iOS versions reject Keychain values of about 2048
// bytes, so each value is stored as ≤ CHUNK_BYTES pieces plus a manifest written last.
//
// Never logs and never throws: a failed or partial read is "no session" (the user signs in again),
// and partial chunk sets are cleaned up. The values are bearer tokens, so they stay out of logs.
import { z } from 'zod';

export type SecureStoreOptionsLike = { keychainAccessible?: number };

/** The subset of `expo-secure-store` the adapter uses (injected, so it is testable in Node). */
export type SecureStoreLike = {
  getItemAsync(key: string, options?: SecureStoreOptionsLike): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStoreOptionsLike): Promise<void>;
  deleteItemAsync(key: string, options?: SecureStoreOptionsLike): Promise<void>;
};

/** Matches supabase-js `SupportedStorage` (async variant). */
export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** UTF-8 bytes per chunk: under the ~2048-byte iOS limit with headroom. */
export const CHUNK_BYTES = 1800;
/** 32 × 1,800 B ≈ 57 KB, far above any real session. Bigger values are refused. */
export const MAX_CHUNKS = 32;

const manifestSchema = z.object({
  v: z.literal(1),
  count: z.int().min(1).max(MAX_CHUNKS),
  length: z.int().nonnegative(),
});

/** SecureStore keys may only contain alphanumerics, `.`, `-` and `_`. */
export function toSecureStoreKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const manifestKey = (base: string) => `${base}.manifest`;
const chunkKey = (base: string, index: number) => `${base}.${index}`;

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Splits on code-point boundaries so no chunk ends inside a multi-byte character. */
export function splitIntoChunks(value: string, maxBytes: number = CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of value) {
    const bytes = utf8Length(char.codePointAt(0) ?? 0);
    if (currentBytes + bytes > maxBytes && current) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

export function createSecureStoreAdapter(
  store: SecureStoreLike,
  options: SecureStoreOptionsLike = {},
): SessionStorage {
  const get = (key: string) => store.getItemAsync(key, options);
  const del = async (key: string) => {
    try {
      await store.deleteItemAsync(key, options);
    } catch {
      // Best effort: a key that can't be deleted is unreadable without its manifest anyway.
    }
  };

  async function readManifest(base: string) {
    const raw = await get(manifestKey(base));
    if (raw === null) return null;
    try {
      const parsed = manifestSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined; // Present but corrupt.
    }
  }

  async function removeAll(base: string, knownCount?: number) {
    // Manifest first: once it is gone, no reader can see a half-deleted set.
    await del(manifestKey(base));
    const count = knownCount ?? MAX_CHUNKS;
    await Promise.all(Array.from({ length: count }, (_, i) => del(chunkKey(base, i))));
  }

  return {
    async getItem(key) {
      const base = toSecureStoreKey(key);
      try {
        const manifest = await readManifest(base);
        if (manifest === null) return null;
        if (manifest === undefined) {
          await removeAll(base);
          return null;
        }
        const chunks = await Promise.all(
          Array.from({ length: manifest.count }, (_, i) => get(chunkKey(base, i))),
        );
        const value = chunks.every((c): c is string => c !== null) ? chunks.join('') : null;
        if (value === null || value.length !== manifest.length) {
          await removeAll(base, manifest.count);
          return null;
        }
        return value;
      } catch {
        await removeAll(base);
        return null;
      }
    },

    async setItem(key, value) {
      const base = toSecureStoreKey(key);
      const chunks = splitIntoChunks(value);
      if (chunks.length > MAX_CHUNKS) return; // Refuse rather than write a value we can't read.
      let previousCount: number | undefined;
      try {
        const previous = await readManifest(base);
        // Unknown (corrupt) previous manifest: sweep every possible chunk afterwards.
        previousCount = previous === undefined ? MAX_CHUNKS : previous?.count;
        // Hide the old value before overwriting its chunks; a crash mid-write reads as "no session".
        await del(manifestKey(base));
        for (const [i, chunk] of chunks.entries()) {
          await store.setItemAsync(chunkKey(base, i), chunk, options);
        }
        const manifest = { v: 1, count: chunks.length, length: value.length };
        await store.setItemAsync(manifestKey(base), JSON.stringify(manifest), options);
        // Drop chunks left over from a longer previous value.
        const staleFrom = chunks.length;
        const staleTo = previousCount ?? 0;
        await Promise.all(
          Array.from({ length: Math.max(0, staleTo - staleFrom) }, (_, i) =>
            del(chunkKey(base, staleFrom + i)),
          ),
        );
      } catch {
        await removeAll(base, Math.max(previousCount ?? 0, chunks.length));
      }
    },

    async removeItem(key) {
      const base = toSecureStoreKey(key);
      let count: number | undefined;
      try {
        const manifest = await readManifest(base);
        count = manifest ? manifest.count : undefined;
      } catch {
        count = undefined;
      }
      await removeAll(base, count);
    },
  };
}
