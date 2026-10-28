// TB-43 AC2/AC3 against the in-memory server: two (or more) devices with their own SQLite DBs
// and clocks, editing offline and syncing in different orders. The same rules are checked against
// the real Postgres function in supabase/tests/database/sync_tables.test.sql and against the real
// local Supabase stack in src/features/sync/sync.integration.test.ts.
import { eq } from 'drizzle-orm';

import { subtasks, tasks, taskTags } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { createList, softDeleteList } from '@/features/tasks/repo/list-repo';
import { addTagToTask, createTag } from '@/features/tasks/repo/tag-repo';
import {
  createSubtask,
  createTask,
  getTaskById,
  listOpenTasks,
  listSubtasks,
  restoreTask,
  softDeleteTask,
  updateTask,
} from '@/features/tasks/repo/task-repo';

import { countDirtyRows, TOMBSTONE_RETENTION_MS } from '../repo/sync-repo';
import { createSyncWorld, USER_A, USER_B } from '../testing/sync-devices';
import { PUSH_BATCH_SIZE } from './sync-engine';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let world: ReturnType<typeof createSyncWorld>;
beforeEach(() => {
  world = createSyncWorld();
});
afterEach(() => world.closeAll());

const allTaskRows = (db: TaskBuddyDb) => db.select().from(tasks).all();
const titleOf = (db: TaskBuddyDb, id: string) =>
  db.select().from(tasks).where(eq(tasks.id, id)).get()?.title;

/** Everything a user would see or that sync carries, minus device-only bookkeeping. */
function comparable(db: TaskBuddyDb) {
  return allTaskRows(db)
    .map(({ syncedUpdatedAt: _synced, ...row }) => row)
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('sync engine: basics', () => {
  it('a task created on device A appears on device B with the same id, and both end clean', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'Buy milk', priority: 2 }));

    expect(countDirtyRows(a.db)).toBe(1);
    expect((await world.sync(a)).pushed).toBe(1);
    expect((await world.sync(b)).changed).toBe(1);

    expect(getTaskById(b.db, task.id)).toMatchObject({ title: 'Buy milk', priority: 2 });
    expect(countDirtyRows(a.db)).toBe(0);
    expect(countDirtyRows(b.db)).toBe(0);
    expect(comparable(a.db)).toEqual(comparable(b.db));
  });

  it('syncs lists, tasks and subtasks (parents before children) and edits back and forth', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const { task } = world.on(a, (db) => {
      const list = createList(db, { name: 'Home' });
      const created = createTask(db, { title: 'Clean', listId: list.id });
      createSubtask(db, { taskId: created.id, title: 'Kitchen' });
      createSubtask(db, { taskId: created.id, title: 'Bath' });
      return { task: created };
    });
    await world.sync(a);
    await world.sync(b);
    expect(listSubtasks(b.db, task.id).map((s) => s.title)).toEqual(['Kitchen', 'Bath']);
    expect(getTaskById(b.db, task.id)?.listId).toBe(getTaskById(a.db, task.id)?.listId);

    world.advance();
    const [kitchen] = listSubtasks(b.db, task.id);
    world.on(b, (db) => updateTask(db, task.id, { title: 'Clean house' }));
    world.on(b, (db) => {
      if (kitchen) createSubtask(db, { taskId: task.id, title: 'Garage' });
    });
    await world.sync(b);
    await world.sync(a);
    expect(titleOf(a.db, task.id)).toBe('Clean house');
    expect(listSubtasks(a.db, task.id).map((s) => s.title)).toEqual(['Kitchen', 'Bath', 'Garage']);
  });

  it('pushes data that existed before sync (legacy rows) on the first cycle', async () => {
    const a = world.device('A');
    world.on(a, (db) => {
      for (let i = 0; i < PUSH_BATCH_SIZE + 5; i++) createTask(db, { title: `Old task ${i}` });
    });
    const result = await world.sync(a);
    expect(result.pushed).toBe(PUSH_BATCH_SIZE + 5);
    expect(world.server.tables.tasks.size).toBe(PUSH_BATCH_SIZE + 5);
    expect(countDirtyRows(a.db)).toBe(0);

    const b = world.device('B');
    await world.sync(b);
    expect(allTaskRows(b.db)).toHaveLength(PUSH_BATCH_SIZE + 5);
  });

  it('a second cycle with nothing new changes nothing (re-reading the overlap window is harmless)', async () => {
    const a = world.device('A');
    const b = world.device('B');
    world.on(a, (db) => createTask(db, { title: 'Once' }));
    await world.sync(a);
    await world.sync(b);
    world.advance(2000);
    expect(await world.sync(b)).toEqual({ pushed: 0, changed: 0, needsAnotherCycle: false });
    expect(await world.sync(a)).toEqual({ pushed: 0, changed: 0, needsAnotherCycle: false });
  });
});

describe('AC2: the same task edited offline on both devices', () => {
  async function editOfflineOnBoth(order: 'later-first' | 'earlier-first') {
    const a = world.device('A');
    const b = world.device('B');
    const shared = world.on(a, (db) => createTask(db, { title: 'Original' }));
    await world.sync(a);
    await world.sync(b);

    a.link.setOnline(false);
    b.link.setOnline(false);
    world.advance(10_000);
    const onlyA = world.on(a, (db) => {
      updateTask(db, shared.id, { title: 'Edited on A (earlier)' });
      return createTask(db, { title: 'Created offline on A' });
    });
    world.advance(10_000);
    const onlyB = world.on(b, (db) => {
      updateTask(db, shared.id, { title: 'Edited on B (later)' });
      return createTask(db, { title: 'Created offline on B' });
    });
    await expect(world.sync(a)).rejects.toMatchObject({ kind: 'network' });

    world.advance(60_000);
    a.link.setOnline(true);
    b.link.setOnline(true);
    const [first, second] = order === 'later-first' ? [b, a] : [a, b];
    await world.sync(first);
    await world.sync(second);
    await world.sync(first);
    return { a, b, shared, onlyA, onlyB };
  }

  it.each(['earlier-first', 'later-first'] as const)(
    'the later updated_at wins; nothing is duplicated or lost (%s reaches the server first)',
    async (order) => {
      const { a, b, shared, onlyA, onlyB } = await editOfflineOnBoth(order);

      for (const device of [a, b]) {
        expect(titleOf(device.db, shared.id)).toBe('Edited on B (later)');
        const ids = allTaskRows(device.db).map((t) => t.id);
        expect(ids).toHaveLength(3); // no duplicates
        expect(new Set(ids)).toEqual(new Set([shared.id, onlyA.id, onlyB.id])); // nothing lost
        expect(countDirtyRows(device.db)).toBe(0);
      }
      expect(comparable(a.db)).toEqual(comparable(b.db));
      expect(world.server.tables.tasks.size).toBe(3);
    },
  );

  it("whole-row LWW: the winning edit replaces the other device's fields too", async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'T', priority: 0 }));
    await world.sync(a);
    await world.sync(b);
    world.advance();
    world.on(a, (db) => updateTask(db, task.id, { priority: 3 }));
    world.advance();
    world.on(b, (db) => updateTask(db, task.id, { title: 'T renamed' }));
    await world.sync(a);
    await world.sync(b);
    await world.sync(a);
    for (const device of [a, b]) {
      expect(getTaskById(device.db, task.id)).toMatchObject({ title: 'T renamed', priority: 0 });
    }
  });

  it("corrects device clock skew: a slow clock's later edit still wins", async () => {
    const a = world.device('A', USER_A, -HOUR); // an hour behind
    const b = world.device('B');
    const task = world.on(b, (db) => createTask(db, { title: 'Original' }));
    await world.sync(b);
    await world.sync(a);

    world.advance(5000);
    world.on(b, (db) => updateTask(db, task.id, { title: 'B, real time t+5s' }));
    world.advance(5000);
    world.on(a, (db) => updateTask(db, task.id, { title: 'A, real time t+10s' }));
    await world.sync(b);
    await world.sync(a);
    await world.sync(b);

    expect(titleOf(a.db, task.id)).toBe('A, real time t+10s');
    expect(titleOf(b.db, task.id)).toBe('A, real time t+10s');
  });

  it('a fast clock cannot win future edits (updated_at is capped at server time)', async () => {
    const a = world.device('A', USER_A, DAY); // a day ahead
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'Original' }));
    await world.sync(a);
    await world.sync(b);
    world.advance(1000);
    world.on(a, (db) => updateTask(db, task.id, { title: 'From the future' }));
    await world.sync(a);
    world.advance(1000);
    world.on(b, (db) => updateTask(db, task.id, { title: 'Really later' }));
    await world.sync(b);
    await world.sync(a);
    expect(titleOf(a.db, task.id)).toBe('Really later');
  });

  it('on an exact tie the first copy to reach the server stays, and both devices converge', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'Original' }));
    await world.sync(a);
    await world.sync(b);
    world.advance(1000);
    world.on(a, (db) => updateTask(db, task.id, { title: 'A' }));
    world.on(b, (db) => updateTask(db, task.id, { title: 'B' })); // same millisecond
    await world.sync(a);
    await world.sync(b);
    await world.sync(a);
    expect(titleOf(a.db, task.id)).toBe('A');
    expect(titleOf(b.db, task.id)).toBe('A');
  });

  it('an edit made while a push is in flight is kept and pushed next', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'v1' }));
    a.link.setBeforeReply(() => {
      world.advance(10);
      world.on(a, (db) => updateTask(db, task.id, { title: 'v2 (typed during the push)' }));
    });
    await world.sync(a);
    a.link.setBeforeReply(undefined);
    expect(titleOf(a.db, task.id)).toBe('v2 (typed during the push)');
    expect(countDirtyRows(a.db)).toBe(1);

    await world.sync(a);
    await world.sync(b);
    expect(titleOf(b.db, task.id)).toBe('v2 (typed during the push)');
  });

  it('a lost push reply (connection drop) never duplicates the task', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'Once only' }));
    a.link.dropNextReply();
    await expect(world.sync(a)).rejects.toMatchObject({ kind: 'network' });
    expect(countDirtyRows(a.db)).toBe(1);
    await world.sync(a); // pushes the same id again
    await world.sync(b);
    expect(world.server.tables.tasks.size).toBe(1);
    expect(allTaskRows(b.db).map((t) => t.id)).toEqual([task.id]);
    expect(countDirtyRows(a.db)).toBe(0);
  });

  it('three devices converge to the same state', async () => {
    const devices = [world.device('A'), world.device('B'), world.device('C', USER_A, 30_000)];
    const [a] = devices;
    const task = world.on(a!, (db) => createTask(db, { title: 'Shared' }));
    for (const d of devices) await world.sync(d);
    devices.forEach((d, i) => {
      world.advance(1000);
      world.on(d, (db) => updateTask(db, task.id, { notes: `note from ${d.name} #${i}` }));
    });
    for (const d of [...devices].reverse()) await world.sync(d);
    for (const d of devices) await world.sync(d);
    const states = devices.map((d) => comparable(d.db));
    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
    expect(getTaskById(devices[0]!.db, task.id)?.notes).toBe('note from C #2');
  });
});

describe('AC3: soft deletes sync as tombstones', () => {
  it('a delete on A reaches B as a tombstone (row kept, deleted_at set, hidden from lists)', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => {
      const created = createTask(db, { title: 'Delete me' });
      createSubtask(db, { taskId: created.id, title: 'step' });
      return created;
    });
    await world.sync(a);
    await world.sync(b);
    world.advance();
    world.on(a, (db) => softDeleteTask(db, task.id));
    await world.sync(a);
    await world.sync(b);

    const row = b.db.select().from(tasks).where(eq(tasks.id, task.id)).get();
    expect(row?.deletedAt).not.toBeNull();
    expect(getTaskById(b.db, task.id)).toBeUndefined();
    expect(listOpenTasks(b.db).items).toEqual([]);
    expect(
      b.db
        .select()
        .from(subtasks)
        .all()
        .every((s) => s.deletedAt !== null),
    ).toBe(true);
    expect(world.server.tables.tasks.get(task.id)?.deleted_at).not.toBeNull();
  });

  it('undo (restore) after a synced delete brings the task back on every device', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'Oops' }));
    await world.sync(a);
    world.advance();
    world.on(a, (db) => softDeleteTask(db, task.id));
    await world.sync(a);
    await world.sync(b);
    world.advance();
    world.on(a, (db) => restoreTask(db, task.id));
    await world.sync(a);
    await world.sync(b);
    expect(getTaskById(b.db, task.id)?.title).toBe('Oops');
  });

  it('delete vs offline edit: the later of the two wins (a later edit revives the task)', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const kept = world.on(a, (db) => createTask(db, { title: 'Edited after the delete' }));
    const gone = world.on(a, (db) => createTask(db, { title: 'Deleted after the edit' }));
    await world.sync(a);
    await world.sync(b);

    world.advance();
    world.on(a, (db) => softDeleteTask(db, kept.id));
    world.on(b, (db) => updateTask(db, gone.id, { notes: 'edit first' }));
    world.advance();
    world.on(b, (db) => updateTask(db, kept.id, { notes: 'edit later' }));
    world.on(a, (db) => softDeleteTask(db, gone.id));
    for (const d of [a, b, a]) await world.sync(d);

    for (const device of [a, b]) {
      expect(getTaskById(device.db, kept.id)?.notes).toBe('edit later');
      expect(getTaskById(device.db, gone.id)).toBeUndefined();
    }
  });

  it('purges synced tombstones after 30 days on the device, with their subtasks and tag links', async () => {
    const a = world.device('A');
    const { old, live } = world.on(a, (db) => {
      const created = {
        old: createTask(db, { title: 'old' }),
        live: createTask(db, { title: 'live' }),
      };
      createSubtask(db, { taskId: created.old.id, title: 'old step' });
      addTagToTask(db, created.old.id, createTag(db, { name: 'work' }).id);
      softDeleteTask(db, created.old.id);
      return created;
    });
    await world.sync(a);
    world.advance(TOMBSTONE_RETENTION_MS - DAY);
    const recent = world.on(a, (db) => {
      const created = createTask(db, { title: 'recent' });
      softDeleteTask(db, created.id);
      return created;
    });
    await world.sync(a);
    expect(allTaskRows(a.db)).toHaveLength(3); // nothing is 30 days old yet

    world.advance(2 * DAY);
    await world.sync(a);
    expect(
      allTaskRows(a.db)
        .map((t) => t.id)
        .sort(),
    ).toEqual([live.id, recent.id].sort());
    expect(a.db.select().from(subtasks).all()).toEqual([]);
    expect(a.db.select().from(taskTags).all()).toEqual([]);
    expect(old.id).toBeDefined();
  });

  it('a deleted list syncs, and its tasks move to the Inbox on both devices', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => {
      const list = createList(db, { name: 'Errands' });
      return createTask(db, { title: 'Post office', listId: list.id });
    });
    await world.sync(a);
    await world.sync(b);
    world.advance();
    world.on(b, (db) => softDeleteList(db, getTaskById(db, task.id)?.listId ?? ''));
    await world.sync(b);
    await world.sync(a);
    expect(getTaskById(a.db, task.id)?.listId).toBeNull();
  });
});

describe('isolation and ordering', () => {
  it('another account never receives or overwrites these rows', async () => {
    const a = world.device('A', USER_A);
    const other = world.device('Other', USER_B);
    world.on(a, (db) => createTask(db, { title: 'Private' }));
    await world.sync(a);
    await world.sync(other);
    expect(allTaskRows(other.db)).toEqual([]);
  });

  it('a child that arrives before its parent waits for the next cycle instead of failing', async () => {
    const a = world.device('A');
    const b = world.device('B');
    // B pulls lists, then A creates a list + task before B pulls tasks.
    const original = b.link.remote.pull;
    let injected = false;
    b.link.remote.pull = async (table, from, limit) => {
      if (table === 'tasks' && !injected) {
        injected = true;
        world.on(a, (db) =>
          createTask(db, { title: 'In a new list', listId: createList(db, { name: 'New' }).id }),
        );
        await world.sync(a);
      }
      return original(table, from, limit);
    };
    const first = await world.sync(b);
    expect(first.needsAnotherCycle).toBe(true);
    expect(allTaskRows(b.db)).toEqual([]);
    const second = await world.sync(b);
    expect(second.needsAnotherCycle).toBe(false);
    expect(allTaskRows(b.db).map((t) => t.title)).toEqual(['In a new list']);
  });

  it('does not stall or churn when the device purged tombstones the server still keeps', async () => {
    const a = world.device('A');
    world.on(a, (db) => {
      const task = createTask(db, { title: 'Gone soon' });
      createSubtask(db, { taskId: task.id, title: 'step' });
      softDeleteTask(db, task.id);
    });
    await world.sync(a);
    world.advance(TOMBSTONE_RETENTION_MS + DAY);
    await world.sync(a); // device purges; the in-memory server has no cron, so it still has them
    expect(allTaskRows(a.db)).toEqual([]);
    world.advance(1000);
    expect(await world.sync(a)).toEqual({ pushed: 0, changed: 0, needsAnotherCycle: false });
    // A fresh device skips tombstones of rows it never had.
    const b = world.device('B');
    expect(await world.sync(b)).toEqual({ pushed: 0, changed: 0, needsAnotherCycle: false });
    expect(allTaskRows(b.db)).toEqual([]);
  });

  it('a live child whose parent the device purged is skipped on the next cycle, not retried forever', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const task = world.on(a, (db) => createTask(db, { title: 'Parent' }));
    await world.sync(a);
    await world.sync(b);
    world.advance();
    world.on(a, (db) => softDeleteTask(db, task.id));
    await world.sync(a);
    await world.sync(b);
    world.advance(TOMBSTONE_RETENTION_MS + DAY);
    await world.sync(b); // B purges the task locally
    // A device that was offline pushes a live subtask under the deleted task.
    world.server.tables.subtasks.set('0190f3b2-0000-7000-8000-0000000000c1', {
      id: '0190f3b2-0000-7000-8000-0000000000c1',
      created_at: 1,
      updated_at: world.now(),
      deleted_at: null,
      task_id: task.id,
      title: 'late step',
      is_done: false,
      sort_order: 0,
      user_id: USER_A,
      server_updated_at: `${new Date(world.now()).toISOString().slice(0, 23)}999+00:00`,
    });
    expect((await world.sync(b)).needsAnotherCycle).toBe(true);
    expect((await world.sync(b)).needsAnotherCycle).toBe(false);
    expect(await world.sync(b)).toEqual({ pushed: 0, changed: 0, needsAnotherCycle: false });
  });

  it('a device away longer than 30 days learns about deletions the server already purged', async () => {
    const a = world.device('A');
    const b = world.device('B');
    const doomed = world.on(a, (db) => createTask(db, { title: 'Deleted while B was away' }));
    const kept = world.on(a, (db) => createTask(db, { title: 'Kept' }));
    await world.sync(a);
    await world.sync(b);
    world.advance();
    world.on(a, (db) => softDeleteTask(db, doomed.id));
    await world.sync(a);
    world.advance(TOMBSTONE_RETENTION_MS + DAY);
    world.server.purge(new Date(world.now() - TOMBSTONE_RETENTION_MS).toISOString());
    expect(world.server.tables.tasks.has(doomed.id)).toBe(false);

    await world.sync(b);
    expect(getTaskById(b.db, doomed.id)).toBeUndefined();
    expect(getTaskById(b.db, kept.id)?.title).toBe('Kept');
    expect(countDirtyRows(b.db)).toBe(0); // marked deleted locally, never pushed back
  });
});
