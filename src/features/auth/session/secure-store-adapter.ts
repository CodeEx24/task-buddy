// supabase-js session storage backed by expo-secure-store, split into chunks (TB-20, spec D1-A).
// A session JSON is often over 2 KB and some iOS versions reject Keychain values of about 2048
// bytes, so each value is stored as ≤ CHUNK_BYTES pieces plus a manifest written last.
//
// Integrity: every write gets a short write id, stored in the manifest and prefixed to each chunk,
// so a set mixing chunks from two writes is rejected. Operations on one key run one at a time.
//
// Never logs and never throws. A provably bad set (manifest fails validation, a chunk is missing,
// ids or length don't match) is deleted. A read that *throws* (a transient Keystore error, or the
// Keychain before first unlock) returns null but deletes nothing, so a valid session survives.
// The values are bearer tokens, so they stay out of logs.
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

/** UTF-8 bytes of data per chunk (+ the 9-byte `<id>:` prefix): under the ~2048-byte iOS limit. */
export const CHUNK_BYTES = 1800;
/** 32 × 1,800 B ≈ 57 KB, far above any real session. Bigger values are refused. */
export const MAX_CHUNKS = 32;

/** Write ids: 8 lowercase base-36 characters, prefixed to each chunk as `<id>:`. */
const WRITE_ID_LENGTH = 8;
const WRITE_ID_RE = new RegExp(`^[0-9a-z]{${WRITE_ID_LENGTH}}$`);

const manifestSchema = z.object({
  v: z.literal(2),
  id: z.string().regex(WRITE_ID_RE),
  count: z.int().min(1).max(MAX_CHUNKS),
  length: z.int().nonnegative(),
});
type Manifest = z.infer<typeof manifestSchema>;

/** Not a secret: only tells two writes apart. */
function createWriteId(): string {
  let id = '';
  while (id.length < WRITE_ID_LENGTH) id += Math.random().toString(36).slice(2);
  return id.slice(0, WRITE_ID_LENGTH);
}

/** Strips the `<id>:` prefix; null when the chunk belongs to another write. */
function chunkData(chunk: string, id: string): string | null {
  return chunk.startsWith(`${id}:`) ? chunk.slice(WRITE_ID_LENGTH + 1) : null;
}

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

  // One queue per key: a read never interleaves with a write or remove of the same key.
  const queues = new Map<string, Promise<unknown>>();
  function serialize<T>(base: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(base) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    queues.set(base, next);
    void next
      .finally(() => {
        if (queues.get(base) === next) queues.delete(base);
      })
      .catch(() => undefined);
    return next;
  }

  /** null: absent · 'invalid': present but fails validation · otherwise the manifest. Throws on read errors. */
  async function readManifest(base: string): Promise<Manifest | null | 'invalid'> {
    const raw = await get(manifestKey(base));
    if (raw === null) return null;
    try {
      const parsed = manifestSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : 'invalid';
    } catch {
      return 'invalid';
    }
  }

  async function removeAll(base: string, knownCount?: number) {
    // Manifest first: once it is gone, no reader can see a half-deleted set.
    await del(manifestKey(base));
    const count = knownCount ?? MAX_CHUNKS;
    await Promise.all(Array.from({ length: count }, (_, i) => del(chunkKey(base, i))));
  }

  async function read(base: string): Promise<string | null> {
    let manifest: Manifest | null | 'invalid';
    let chunks: (string | null)[];
    try {
      manifest = await readManifest(base);
      if (manifest === null) return null;
      if (manifest === 'invalid') {
        await removeAll(base);
        return null;
      }
      const { count } = manifest;
      chunks = await Promise.all(Array.from({ length: count }, (_, i) => get(chunkKey(base, i))));
    } catch {
      return null; // Transient or locked store: keep whatever is there.
    }
    const { id } = manifest;
    const parts = chunks.map((chunk) => (chunk === null ? null : chunkData(chunk, id)));
    const value = parts.every((part): part is string => part !== null) ? parts.join('') : null;
    if (value === null || value.length !== manifest.length) {
      await removeAll(base, manifest.count);
      return null;
    }
    return value;
  }

  async function write(base: string, value: string): Promise<void> {
    const chunks = splitIntoChunks(value);
    if (chunks.length > MAX_CHUNKS) return; // Refuse rather than write a value we can't read.
    const id = createWriteId();
    let previousCount: number | undefined;
    try {
      const previous = await readManifest(base);
      // Unknown (invalid) previous manifest: sweep every possible chunk afterwards.
      previousCount = previous === 'invalid' ? MAX_CHUNKS : previous?.count;
      // Hide the old value before overwriting its chunks; a crash mid-write reads as "no session".
      await del(manifestKey(base));
      for (const [i, chunk] of chunks.entries()) {
        await store.setItemAsync(chunkKey(base, i), `${id}:${chunk}`, options);
      }
      const manifest: Manifest = { v: 2, id, count: chunks.length, length: value.length };
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
  }

  async function remove(base: string): Promise<void> {
    let count: number | undefined;
    try {
      const manifest = await readManifest(base);
      count = manifest && manifest !== 'invalid' ? manifest.count : undefined;
    } catch {
      count = undefined;
    }
    await removeAll(base, count);
  }

  return {
    getItem: (key) => {
      const base = toSecureStoreKey(key);
      return serialize(base, () => read(base));
    },
    setItem: (key, value) => {
      const base = toSecureStoreKey(key);
      return serialize(base, () => write(base, value));
    },
    removeItem: (key) => {
      const base = toSecureStoreKey(key);
      return serialize(base, () => remove(base));
    },
  };
}
