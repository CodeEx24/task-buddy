/// <reference types="node" />
// TB-43 against a real local Supabase stack (Auth, PostgREST, Postgres with this branch's
// migration, Realtime): two "devices" signed in as the same real user, each with its own SQLite
// DB, running the app's real sync engine, Supabase remote and scheduler.
// Excluded from `pnpm test`; run with the stack up and the migration applied:
//   SYNC_IT=1 SYNC_IT_URL=http://127.0.0.1:54321 SYNC_IT_KEY=<publishable/anon key> \
//   SYNC_IT_SERVICE_KEY=<secret/service-role key> \
//   pnpm exec jest -c jest.integration.config.js --maxWorkers=1 sync.integration
// The service key is used only to create confirmed test users and to run the purge (as the
// pg_cron job would). Keys come from `supabase status -o env`; never commit or print them.
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { tasks } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { createTask, softDeleteTask, updateTask } from '@/features/tasks/repo/task-repo';
import type { Database } from '@/lib/database.types';
import type { TaskBuddySupabaseClient } from '@/lib/supabase';

import { runSyncCycle } from './engine/sync-engine';
import { createSyncScheduler, type SyncScheduler } from './engine/sync-scheduler';
import { countDirtyRows } from './repo/sync-repo';
import { createSupabaseSyncRemote } from './remote/supabase-remote';
import { SyncRemoteError, type SyncRemote } from './remote/sync-remote';

// Node has crypto.getRandomValues built in; the Expo module (React Native runtime) can't load here.
jest.mock('expo-crypto', () => ({
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
    const { webcrypto } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
    return webcrypto.getRandomValues(array as unknown as Uint8Array) as unknown as T;
  },
}));

const IS_ENABLED = process.env.SYNC_IT === '1';
const URL = process.env.SYNC_IT_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SYNC_IT_KEY ?? '';
const SERVICE_KEY = process.env.SYNC_IT_SERVICE_KEY ?? '';
const AC1_LIMIT_MS = 10_000;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

type Account = { userId: string; email: string; password: string };
type Device = {
  name: string;
  handle: NodeDb;
  db: TaskBuddyDb;
  client: TaskBuddySupabaseClient;
  remote: SyncRemote;
  /** Simulated connectivity: while false every call fails like a dropped network. */
  setOnline: (online: boolean) => void;
};

const devices: Device[] = [];
const schedulers: SyncScheduler[] = [];
const unsubscribes: (() => void)[] = [];

async function createAccount(tag: string): Promise<Account> {
  const admin = createClient<Database>(URL, SERVICE_KEY, noSession);
  const email = `tb43-it-${tag}-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const password = randomBytes(18).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.code ?? 'no user'}`);
  return { userId: data.user.id, email, password };
}

async function signInDevice(name: string, account: Account): Promise<Device> {
  const client = createClient<Database>(URL, KEY, noSession);
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`sign-in failed: ${error.code ?? error.status}`);
  const real = createSupabaseSyncRemote(client, account.userId);
  let isOnline = true;
  const ensureOnline = () => {
    if (!isOnline) throw new SyncRemoteError('network');
  };
  const remote: SyncRemote = {
    push: async (...args) => {
      ensureOnline();
      return real.push(...args);
    },
    pull: async (...args) => {
      ensureOnline();
      return real.pull(...args);
    },
    subscribe: (...args) => real.subscribe(...args),
  };
  const handle = openMigratedNodeDb();
  const device = {
    name,
    handle,
    db: handle.db,
    client,
    remote,
    setOnline: (online: boolean) => {
      isOnline = online;
    },
  };
  devices.push(device);
  return device;
}

const sync = (device: Device) => runSyncCycle({ db: device.db, remote: device.remote });
const titleOn = (device: Device, id: string) =>
  device.db.select().from(tasks).where(eq(tasks.id, id)).get()?.title;
const taskIds = (device: Device) =>
  device.db
    .select()
    .from(tasks)
    .all()
    .map((t) => t.id)
    .sort();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, timeoutMs: number): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return Date.now() - started;
    await pause(25);
  }
  throw new Error(`condition not met within ${timeoutMs} ms`);
}

/** The app's live wiring (SyncProvider without React): scheduler + Realtime subscription. */
async function startLiveSync(device: Device): Promise<SyncScheduler> {
  const scheduler = createSyncScheduler({
    run: () => runSyncCycle({ db: device.db, remote: device.remote }),
  });
  schedulers.push(scheduler);
  let isConnected = false;
  unsubscribes.push(
    device.remote.subscribe(
      () => scheduler.request('remote-change'),
      (state) => {
        if (state === 'connected' && !isConnected) scheduler.request('reconnect');
        isConnected = state === 'connected';
        scheduler.setLive(isConnected);
      },
    ),
  );
  scheduler.request('start');
  await waitFor(() => isConnected, 15_000);
  await pause(1000); // let the first cycle finish
  return scheduler;
}

const describeIfEnabled = IS_ENABLED ? describe : describe.skip;

describeIfEnabled('offline-first sync against local Supabase (TB-43)', () => {
  jest.setTimeout(120_000);
  let account: Account;

  beforeAll(async () => {
    if (!KEY || !SERVICE_KEY) throw new Error('Set SYNC_IT_KEY and SYNC_IT_SERVICE_KEY');
    account = await createAccount('owner');
  });

  afterAll(async () => {
    for (const scheduler of schedulers.splice(0)) scheduler.stop();
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    for (const device of devices.splice(0)) {
      await device.client.removeAllChannels();
      device.client.realtime.disconnect();
      device.handle.close();
    }
  });

  it.each(['earlier edit reaches the server first', 'later edit reaches the server first'])(
    'AC2: same task edited offline on both devices → later updated_at wins, nothing duplicated or lost (%s)',
    async (order) => {
      const a = await signInDevice('A', account);
      const b = await signInDevice('B', account);
      const shared = createTask(a.db, { title: 'Original' });
      await sync(a);
      await sync(b);
      expect(titleOn(b, shared.id)).toBe('Original');

      a.setOnline(false);
      b.setOnline(false);
      updateTask(a.db, shared.id, { title: 'A: earlier edit' });
      const onlyA = createTask(a.db, { title: 'Created offline on A' });
      await pause(300);
      updateTask(b.db, shared.id, { title: 'B: later edit' });
      const onlyB = createTask(b.db, { title: 'Created offline on B' });
      await expect(sync(a)).rejects.toMatchObject({ kind: 'network' });

      a.setOnline(true);
      b.setOnline(true);
      const [first, second] = order.startsWith('earlier') ? [a, b] : [b, a];
      await sync(first);
      await sync(second);
      await sync(first);

      const expected = [shared.id, onlyA.id, onlyB.id].sort();
      for (const device of [a, b]) {
        expect(titleOn(device, shared.id)).toBe('B: later edit');
        expect(taskIds(device)).toEqual(expect.arrayContaining(expected));
        expect(countDirtyRows(device.db)).toBe(0);
      }
      expect(taskIds(a)).toEqual(taskIds(b));
      const server = await a.client.from('tasks').select('id, title').in('id', expected);
      expect(server.error).toBeNull();
      expect(server.data).toHaveLength(3); // one server row per task: no duplicates
      expect(server.data?.find((t) => t.id === shared.id)?.title).toBe('B: later edit');
    },
  );

  it('AC3: a delete syncs as a tombstone and the server purge removes it after 30 days', async () => {
    const a = await signInDevice('A', account);
    const b = await signInDevice('B', account);
    const doomed = createTask(a.db, { title: 'Delete me' });
    await sync(a);
    await sync(b);
    softDeleteTask(a.db, doomed.id);
    await sync(a);
    await sync(b);

    const onB = b.db.select().from(tasks).where(eq(tasks.id, doomed.id)).get();
    expect(onB?.deletedAt).not.toBeNull(); // tombstone, not a missing row
    const tombstone = await b.client
      .from('tasks')
      .select('deleted_at')
      .eq('id', doomed.id)
      .single();
    expect(tombstone.data?.deleted_at).toEqual(expect.any(Number));

    const admin = createClient<Database>(URL, SERVICE_KEY, noSession);
    const fresh = await admin.rpc('sync_purge_tombstones');
    expect(fresh.error).toBeNull();
    expect((await admin.from('tasks').select('id').eq('id', doomed.id)).data).toHaveLength(1);
    // As if 30 days had passed: cutoff just after now (the daily pg_cron job uses now() - 30 days).
    const later = await admin.rpc('sync_purge_tombstones', {
      p_cutoff: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(later.error).toBeNull();
    expect((await admin.from('tasks').select('id').eq('id', doomed.id)).data).toEqual([]);
  });

  it('RLS: another account never receives these rows and cannot overwrite them', async () => {
    const a = await signInDevice('A', account);
    const mine = createTask(a.db, { title: 'Private to the owner' });
    await sync(a);

    const intruder = await signInDevice('Intruder', await createAccount('intruder'));
    await sync(intruder);
    expect(taskIds(intruder)).toEqual([]);
    const direct = await intruder.client.from('tasks').select('id').eq('id', mine.id);
    expect(direct.data).toEqual([]);

    const forged = await intruder.remote.push(
      'tasks',
      [
        {
          id: mine.id,
          created_at: 1,
          updated_at: Date.now() + 1_000_000,
          deleted_at: null,
          list_id: null,
          title: 'hijacked',
          notes: null,
          status: 'open',
          priority: 0,
          due_at: null,
          completed_at: null,
          sort_order: 0,
        },
      ],
      Date.now(),
    );
    expect(forged.rows).toEqual([]);
    await sync(a);
    expect(titleOn(a, mine.id)).toBe('Private to the owner');
  });

  it('AC1: an edit on device A shows on device B within 10 s (Realtime-triggered), also right after B comes online', async () => {
    const a = await signInDevice('A', account);
    const b = await signInDevice('B', account);
    const task = createTask(a.db, { title: 'Live v0' });
    await sync(a);
    await startLiveSync(b);
    await waitFor(() => titleOn(b, task.id) === 'Live v0', AC1_LIMIT_MS);

    // Warm-up, reported but not asserted: right after a local Realtime server starts, its change
    // feed can take a few seconds to begin streaming after SUBSCRIBED (the 5 s fallback poll
    // covers that window in the app).
    const warmUpStart = Date.now();
    updateTask(a.db, task.id, { title: 'Live warm-up' });
    await sync(a);
    await waitFor(() => titleOn(b, task.id) === 'Live warm-up', 30_000);
    const warmUp = Date.now() - warmUpStart;

    // B online, live: A edits and syncs (as A's SyncProvider would after the write).
    const latencies: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const title = `Live v${i}`;
      const editedAt = Date.now();
      updateTask(a.db, task.id, { title });
      await sync(a);
      await waitFor(() => titleOn(b, task.id) === title, AC1_LIMIT_MS);
      latencies.push(Date.now() - editedAt);
      await pause(200);
    }

    // B offline while A edits; then B comes back online.
    b.setOnline(false);
    updateTask(a.db, task.id, { title: 'Edited while B was offline' });
    await sync(a);
    await pause(1500);
    b.setOnline(true);
    const onlineAt = Date.now();
    await waitFor(() => titleOn(b, task.id) === 'Edited while B was offline', AC1_LIMIT_MS);
    const afterOnline = Date.now() - onlineAt;

    // Evidence for verification.md (no task text or keys).
    console.log(
      `[TB-43 AC1] warm-up ${warmUp} ms; edit→visible on B (ms): ${latencies.join(', ')}; ` +
        `max ${Math.max(...latencies)}; after B came online: ${afterOnline} ms`,
    );
    expect(Math.max(...latencies)).toBeLessThan(AC1_LIMIT_MS);
    expect(afterOnline).toBeLessThan(AC1_LIMIT_MS);
  });
});
