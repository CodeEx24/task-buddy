/// <reference types="node" />
// Test harness (TB-43): simulated devices, each with its own migrated SQLite DB and clock, syncing
// through the in-memory server. One shared "real" clock; each device's clock is off by `skew`.
import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import type { TaskBuddyDb } from '@/db/types';

import { runSyncCycle, type SyncCycleResult } from '../engine/sync-engine';
import { createFakeSyncServer, type FakeSyncServer } from './fake-sync-server';

export const USER_A = '0190f3b2-0000-7000-8000-00000000a001';
export const USER_B = '0190f3b2-0000-7000-8000-00000000b002';

export type TestDevice = {
  name: string;
  handle: NodeDb;
  db: TaskBuddyDb;
  link: ReturnType<FakeSyncServer['remoteFor']>;
  /** Device clock = real time + skew (ms). */
  skew: number;
};

export function createSyncWorld(start = 1_800_000_000_000) {
  let realNow = start;
  const server = createFakeSyncServer({ now: () => realNow });
  const devices: TestDevice[] = [];

  const deviceNow = (device: TestDevice) => realNow + device.skew;

  return {
    server,
    now: () => realNow,
    /** Moves real time forward (every device clock moves with it). */
    advance(ms = 1000) {
      realNow += ms;
      return realNow;
    },
    device(name: string, userId = USER_A, skew = 0): TestDevice {
      const handle = openMigratedNodeDb();
      const device = { name, handle, db: handle.db, link: server.remoteFor(userId), skew };
      devices.push(device);
      return device;
    },
    /** Runs `action` with Date.now() reading the device's clock (repositories stamp with it). */
    on<T>(device: TestDevice, action: (db: TaskBuddyDb) => T): T {
      const spy = jest.spyOn(Date, 'now').mockImplementation(() => deviceNow(device));
      try {
        return action(device.db);
      } finally {
        spy.mockRestore();
      }
    },
    sync(device: TestDevice): Promise<SyncCycleResult> {
      return runSyncCycle({
        db: device.db,
        remote: device.link.remote,
        now: () => deviceNow(device),
      });
    },
    closeAll() {
      for (const device of devices.splice(0)) device.handle.close();
    },
  };
}
