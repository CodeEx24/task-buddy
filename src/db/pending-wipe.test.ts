// TB-53: local wipes owed to deleted accounts survive failures and app restarts.
import {
  addPendingWipe,
  runPendingWipes,
  setPendingWipeStoreForTests,
  type PendingWipeStore,
} from './pending-wipe';

const USER_A = '0190f3b2-0000-7000-8000-00000000a001';
const USER_B = '0190f3b2-0000-7000-8000-00000000b002';

function memoryStore(initial: string | null = null): PendingWipeStore & { value: string | null } {
  const store = {
    value: initial,
    read: async () => store.value,
    write: async (value: string | null) => {
      store.value = value;
    },
  };
  return store;
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  setPendingWipeStoreForTests(null);
});

it('wipes an owed account once, then forgets it (memory and storage)', async () => {
  const store = memoryStore();
  setPendingWipeStoreForTests(store);
  await addPendingWipe(USER_A);
  expect(JSON.parse(store.value ?? '[]')).toEqual([USER_A]);

  const wipe = jest.fn(async () => {});
  await runPendingWipes(wipe);
  expect(wipe).toHaveBeenCalledWith(USER_A);
  expect(store.value).toBeNull();

  await runPendingWipes(wipe);
  expect(wipe).toHaveBeenCalledTimes(1);
});

it('a failed wipe stays owed and is retried on the next run; the log has no id', async () => {
  const store = memoryStore();
  setPendingWipeStoreForTests(store);
  await addPendingWipe(USER_A);

  await runPendingWipes(async () => {
    throw new Error(`locked ${USER_A}`);
  });
  expect(JSON.parse(store.value ?? '[]')).toEqual([USER_A]);
  expect(JSON.stringify(warn.mock.calls)).not.toContain(USER_A);

  const wipe = jest.fn(async () => {});
  await runPendingWipes(wipe);
  expect(wipe).toHaveBeenCalledWith(USER_A);
  expect(store.value).toBeNull();
});

it('after an app restart (memory lost) the persisted id is still wiped', async () => {
  setPendingWipeStoreForTests(memoryStore(JSON.stringify([USER_B])));
  const wipe = jest.fn(async () => {});
  await runPendingWipes(wipe);
  expect(wipe).toHaveBeenCalledWith(USER_B);
});

it('works from memory when storage fails, and ignores corrupt storage or a non-UUID id', async () => {
  setPendingWipeStoreForTests({
    read: async () => 'not json',
    write: async () => {
      throw new Error('keychain locked');
    },
  });
  await addPendingWipe(USER_A);
  await addPendingWipe('../etc');
  const wipe = jest.fn(async () => {});
  await runPendingWipes(wipe);
  expect(wipe.mock.calls).toEqual([[USER_A]]);
});

it('concurrent runs share one pass (no double wipe)', async () => {
  setPendingWipeStoreForTests(memoryStore());
  await addPendingWipe(USER_A);
  const wipe = jest.fn(async () => {});
  await Promise.all([runPendingWipes(wipe), runPendingWipes(wipe)]);
  expect(wipe).toHaveBeenCalledTimes(1);
});
