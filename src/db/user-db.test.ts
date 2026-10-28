import { ZodError } from 'zod';

import { createTask, listOpenTasks } from '@/features/tasks/repo/task-repo';

import { clearUserDb, getDb, migrateDb, openUserDb, resetDbForTests } from './node-client';
import { readDbOwner, userDatabaseName } from './user-db';

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
