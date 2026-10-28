import {
  CHUNK_BYTES,
  createSecureStoreAdapter,
  MAX_CHUNKS,
  splitIntoChunks,
  toSecureStoreKey,
  type SecureStoreLike,
  type SecureStoreOptionsLike,
} from './secure-store-adapter';

const IOS_LIMIT_BYTES = 2048;
const utf8Bytes = (value: string) => Buffer.byteLength(value, 'utf8');

/** A Map-backed SecureStore that, like some iOS versions, rejects values over 2048 bytes. */
function createMemoryStore() {
  const data = new Map<string, string>();
  const getItemAsync = jest.fn(
    async (key: string, _options?: SecureStoreOptionsLike) => data.get(key) ?? null,
  );
  const setItemAsync = jest.fn(
    async (key: string, value: string, _options?: SecureStoreOptionsLike) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error('Invalid key');
      if (utf8Bytes(value) > IOS_LIMIT_BYTES) throw new Error('Value too large');
      data.set(key, value);
    },
  );
  const deleteItemAsync = jest.fn(async (key: string, _options?: SecureStoreOptionsLike) => {
    data.delete(key);
  });
  const store: SecureStoreLike = { getItemAsync, setItemAsync, deleteItemAsync };
  return { store, data, getItemAsync, setItemAsync, deleteItemAsync };
}

const KEY = 'sb-wsmjplylzphwecxlbbbv-auth-token';
/** A session-sized JSON value (several KB) with multi-byte characters. */
const BIG_VALUE = JSON.stringify({
  access_token: 'x'.repeat(1500),
  refresh_token: 'r'.repeat(40),
  user: { email: 'jane@example.com', user_metadata: { name: 'Zoë ✓ 日本 😀'.repeat(150) } },
});

describe('splitIntoChunks', () => {
  it('never exceeds the byte budget or splits a multi-byte character', () => {
    const chunks = splitIntoChunks(BIG_VALUE);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(utf8Bytes(chunk)).toBeLessThanOrEqual(CHUNK_BYTES);
    expect(chunks.join('')).toBe(BIG_VALUE);
  });

  it('returns one (possibly empty) chunk for short values', () => {
    expect(splitIntoChunks('')).toEqual(['']);
    expect(splitIntoChunks('abc')).toEqual(['abc']);
  });
});

describe('createSecureStoreAdapter (TB-20 AC3)', () => {
  it('round-trips a value larger than the iOS SecureStore limit', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    expect(utf8Bytes(BIG_VALUE)).toBeGreaterThan(IOS_LIMIT_BYTES);

    await adapter.setItem(KEY, BIG_VALUE);

    expect(await adapter.getItem(KEY)).toBe(BIG_VALUE);
    for (const value of data.values()) {
      expect(utf8Bytes(value)).toBeLessThanOrEqual(IOS_LIMIT_BYTES);
    }
  });

  it('returns null when nothing is stored', async () => {
    expect(await createSecureStoreAdapter(createMemoryStore().store).getItem(KEY)).toBeNull();
  });

  it('passes the keychain options to every native call', async () => {
    const { store, getItemAsync, setItemAsync, deleteItemAsync } = createMemoryStore();
    const options = { keychainAccessible: 7 };
    const adapter = createSecureStoreAdapter(store, options);
    await adapter.setItem(KEY, 'v');
    await adapter.getItem(KEY);
    await adapter.removeItem(KEY);
    for (const call of setItemAsync.mock.calls) expect(call[2]).toBe(options);
    for (const call of getItemAsync.mock.calls) expect(call[1]).toBe(options);
    for (const call of deleteItemAsync.mock.calls) expect(call[1]).toBe(options);
    expect(setItemAsync).toHaveBeenCalled();
    expect(deleteItemAsync).toHaveBeenCalled();
  });

  it('removes every chunk and the manifest', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, BIG_VALUE);
    await adapter.removeItem(KEY);
    expect(data.size).toBe(0);
    expect(await adapter.getItem(KEY)).toBeNull();
  });

  it('drops chunks left over from a longer previous value', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, BIG_VALUE);
    await adapter.setItem(KEY, 'short');
    expect(await adapter.getItem(KEY)).toBe('short');
    expect([...data.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.manifest`]);
  });

  it('treats a missing chunk as no session and cleans up', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, BIG_VALUE);
    data.delete(`${KEY}.1`);
    expect(await adapter.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('treats a corrupt manifest as no session and cleans up', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, 'value');
    data.set(`${KEY}.manifest`, '{"v":3}');
    expect(await adapter.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('treats a length mismatch (half-written value) as no session', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, 'value');
    data.set(`${KEY}.0`, (data.get(`${KEY}.0`) ?? '').slice(0, -1));
    expect(await adapter.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('keeps a valid session when a read throws (transient Keystore error, before first unlock)', async () => {
    const { store, data, getItemAsync, deleteItemAsync } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, BIG_VALUE);
    const stored = new Map(data);
    deleteItemAsync.mockClear();

    getItemAsync.mockRejectedValueOnce(new Error('User interaction is not allowed')); // manifest
    expect(await adapter.getItem(KEY)).toBeNull();
    getItemAsync.mockImplementationOnce(async (key: string) => data.get(key) ?? null); // manifest ok
    getItemAsync.mockRejectedValueOnce(new Error('keystore busy')); // first chunk throws
    expect(await adapter.getItem(KEY)).toBeNull();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(data).toEqual(stored);
    expect(await adapter.getItem(KEY)).toBe(BIG_VALUE);
  });

  it('rejects a set that mixes chunks from two writes', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, BIG_VALUE);
    const chunkFromFirstWrite = data.get(`${KEY}.1`);
    await adapter.setItem(KEY, BIG_VALUE.replace(/x/g, 'y'));
    data.set(`${KEY}.1`, chunkFromFirstWrite ?? '');

    expect(await adapter.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('rejects a manifest from the old format (v1)', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    data.set(`${KEY}.manifest`, JSON.stringify({ v: 1, count: 1, length: 5 }));
    data.set(`${KEY}.0`, 'value');
    expect(await adapter.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('serializes overlapping writes to one key: the last write wins, intact', async () => {
    const { store, data, setItemAsync } = createMemoryStore();
    let inFlight = 0;
    let maxInFlight = 0;
    setItemAsync.mockImplementation(async (key: string, value: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      data.set(key, value);
      inFlight -= 1;
    });
    const adapter = createSecureStoreAdapter(store);
    const first = BIG_VALUE;
    const second = BIG_VALUE.replace(/x/g, 'y');

    await Promise.all([adapter.setItem(KEY, first), adapter.setItem(KEY, second)]);

    expect(maxInFlight).toBe(1);
    expect(await adapter.getItem(KEY)).toBe(second);
    const manifest = JSON.parse(data.get(`${KEY}.manifest`) ?? '{}') as {
      id: string;
      count: number;
    };
    for (let i = 0; i < manifest.count; i += 1) {
      expect(data.get(`${KEY}.${i}`)?.startsWith(`${manifest.id}:`)).toBe(true);
    }
  });

  it('never throws when the native store fails, and leaves no partial value', async () => {
    const { store, data, getItemAsync, setItemAsync } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(adapter.getItem(KEY)).resolves.toBeNull();
    getItemAsync.mockImplementation(async (key: string) => data.get(key) ?? null);

    let writes = 0;
    setItemAsync.mockImplementation(async (key: string, value: string) => {
      writes += 1;
      if (writes === 2) throw new Error('disk full');
      data.set(key, value);
    });
    await expect(adapter.setItem(KEY, BIG_VALUE)).resolves.toBeUndefined();
    expect(await adapter.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('refuses values that need more than MAX_CHUNKS chunks instead of writing them', async () => {
    const { store, data } = createMemoryStore();
    const adapter = createSecureStoreAdapter(store);
    await adapter.setItem(KEY, 'x'.repeat(CHUNK_BYTES * MAX_CHUNKS + 1));
    expect(data.size).toBe(0);
  });

  it('sanitizes keys to the SecureStore character set', async () => {
    expect(toSecureStoreKey('sb-abc-auth-token')).toBe('sb-abc-auth-token');
    expect(toSecureStoreKey('sb:abc/auth token')).toBe('sb_abc_auth_token');
    const adapter = createSecureStoreAdapter(createMemoryStore().store);
    await adapter.setItem('sb:abc/auth token', 'v');
    expect(await adapter.getItem('sb:abc/auth token')).toBe('v');
  });
});
