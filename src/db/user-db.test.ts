import { ZodError } from 'zod';

import { createTask, listOpenTasks } from '@/features/tasks/repo/task-repo';

import {
  clearUserDb,
  deleteUserDb,
  getDb,
  migrateDb,
  openDbNamesForTests,
  openUserDb,
  resetDbForTests,
} from './node-client';
import {
  LEGACY_DATABASE_NAME,
  LocalWipeError,
  RETIRED_DB_OWNER,
  readDbOwner,
  userDatabaseName,
  wipeUserDb,
} from './user-db';

// TB-43 spec D5 (fixes TB-20 D7-A): one local database per account on a shared device.
const USER_A = '0190f3b2-0000-7000-8000-00000000a001';
const USER_B = '0190f3b2-0000-7000-8000-00000000b002';

beforeEach(() => resetDbForTests());
afterAll(() => resetDbForTests());

describe('one local database per account', () => {
  it('the first account to sign in adopts the existing (pre-sync) database and its tasks', async () => {
    const legacy = getDb();
    await migrateDb(legacy);
    createTask(legacy, { title: 'Made before sync existed' });

    const db = await openUserDb(USER_A);
    expect(db).toBe(legacy);
    expect(readDbOwner(db)).toBe(USER_A);
    expect(listOpenTasks(getDb()).items.map((t) => t.title)).toEqual(['Made before sync existed']);
  });

  it('a second account on the same device gets its own empty database (no leak)', async () => {
    const a = await openUserDb(USER_A);
    createTask(a, { title: "A's private task" });

    const b = await openUserDb(USER_B);
    expect(b).not.toBe(a);
    expect(readDbOwner(b)).toBe(USER_B);
    expect(listOpenTasks(getDb()).items).toEqual([]);
    createTask(b, { title: "B's task" });

    // A signs back in: their tasks (and any unsynced changes) are still there, B's are not.
    await openUserDb(USER_A);
    expect(listOpenTasks(getDb()).items.map((t) => t.title)).toEqual(["A's private task"]);
  });

  it('accepts only a UUID as the account id (it becomes part of a file name)', async () => {
    await expect(openUserDb('../../etc/passwd')).rejects.toBeInstanceOf(ZodError);
    expect(() => userDatabaseName('a/b')).toThrow(ZodError);
    expect(userDatabaseName(USER_B.toUpperCase())).toBe(`taskbuddy-${USER_B}.db`);
  });

  it('a fast account switch never leaves the previous account selected', async () => {
    const first = openUserDb(USER_A);
    const second = openUserDb(USER_B);
    const [a, b] = await Promise.all([first, second]);
    expect(getDb()).toBe(b);
    expect(getDb()).not.toBe(a);

    const late = openUserDb(USER_A);
    clearUserDb(); // signed out before it finished, then B signs in
    const nextUser = await openUserDb(USER_B);
    await late;
    expect(getDb()).toBe(nextUser);
  });
});

// TB-53: account deletion wipes the deleted account's local data and nobody else's.
describe('deleteUserDb', () => {
  /** What sign-out does before the wipe runs (useDbMigrations with no user). */
  const signOutLocally = () => clearUserDb();

  it('empties and retires the legacy file the deleted account owned; the next account gets its own file', async () => {
    const a = await openUserDb(USER_A);
    createTask(a, { title: "A's task" });
    signOutLocally();

    await deleteUserDb(USER_A);

    const legacy = getDb(); // nobody selected: the legacy file
    expect(readDbOwner(legacy)).toBe(RETIRED_DB_OWNER);
    expect(listOpenTasks(legacy).items).toEqual([]);
    // Signing in again (same email = a brand-new account) never reopens the retired file.
    const again = await openUserDb(USER_A);
    expect(again).not.toBe(legacy);
    expect(listOpenTasks(again).items).toEqual([]);
    expect(openDbNamesForTests()).toContain(userDatabaseName(USER_A));
  });

  it("review fix: deleting the legacy owner keeps another account's own file reachable", async () => {
    const a = await openUserDb(USER_A); // owns the legacy file
    createTask(a, { title: "A's task" });
    const b = await openUserDb(USER_B); // gets taskbuddy-<B>.db
    createTask(b, { title: "B's unsynced task" });
    signOutLocally();

    await deleteUserDb(USER_A);

    // B signs in next: their own file (and unsynced task) is still the one they get.
    expect(listOpenTasks(await openUserDb(USER_B)).items.map((t) => t.title)).toEqual([
      "B's unsynced task",
    ]);
  });

  it("deletes only the deleted account's own file; the legacy owner's data stays", async () => {
    const a = await openUserDb(USER_A);
    createTask(a, { title: "A's task" });
    const b = await openUserDb(USER_B);
    createTask(b, { title: "B's task" });
    signOutLocally();

    await deleteUserDb(USER_B);

    expect(openDbNamesForTests()).toEqual([LEGACY_DATABASE_NAME]);
    expect(listOpenTasks(await openUserDb(USER_A)).items.map((t) => t.title)).toEqual(["A's task"]);
    expect(listOpenTasks(await openUserDb(USER_B)).items).toEqual([]);
  });

  it('is idempotent and fine when the account never had a file on this device', async () => {
    await expect(deleteUserDb(USER_B)).resolves.toBeUndefined();
    await expect(deleteUserDb(USER_B)).resolves.toBeUndefined();
    await expect(deleteUserDb('../x')).rejects.toBeInstanceOf(ZodError);
  });

  it('attempts every step and reports failures without data', async () => {
    const wiper = {
      open: () => {
        throw new Error('legacy unavailable');
      },
      migrate: async () => {},
      compact: () => {},
      deleteFile: jest.fn(() => {
        throw new Error('locked');
      }),
    };
    const error = await wipeUserDb(USER_A, wiper).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocalWipeError);
    expect((error as LocalWipeError).failedSteps).toBe(2);
    expect(wiper.deleteFile).toHaveBeenCalledWith(userDatabaseName(USER_A)); // tried despite step 1
  });
});
