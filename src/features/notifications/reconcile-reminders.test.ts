import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import {
  createTask,
  restoreTask,
  softDeleteTask,
  updateTask,
} from '@/features/tasks/repo/task-repo';

import { DUE_NOW_GRACE_MS, reconcileReminders } from './reconcile-reminders';
import { MAX_SCHEDULED_REMINDERS } from './reminder-scheduler';
import {
  createFakeReminderScheduler,
  type FakeReminderScheduler,
} from './testing/fake-reminder-scheduler';

const at = (d: number, h = 0, min = 0) => new Date(2027, 0, d, h, min).getTime();
const NOW = at(10, 12);

let handle: NodeDb;
let scheduler: FakeReminderScheduler;
beforeEach(() => {
  handle = openMigratedNodeDb();
  scheduler = createFakeReminderScheduler();
});
afterEach(() => handle.close());

const reconcile = (options: { now?: number; mayPrompt?: boolean } = {}) =>
  reconcileReminders({
    db: handle.db,
    scheduler,
    now: options.now ?? NOW,
    mayPrompt: options.mayPrompt ?? true,
  });

describe('reconcileReminders (TB-40)', () => {
  it('AC1: schedules a reminder at the due time of a new task, with its title', async () => {
    const task = createTask(handle.db, { title: 'Pay rent', dueAt: at(10, 18, 30) });
    await reconcile();
    expect(scheduler.list()).toEqual([
      { taskId: task.id, fireAt: at(10, 18, 30), title: 'Pay rent' },
    ]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    createTask(handle.db, { title: 'a', dueAt: at(11, 9) });
    await reconcile();
    const calls = { ...scheduler.calls };
    expect(await reconcile()).toMatchObject({ scheduled: 0, cancelled: 0 });
    expect(scheduler.calls).toEqual(calls);
  });

  it('AC3: editing the due time reschedules; a title edit updates the reminder', async () => {
    const task = createTask(handle.db, { title: 'Dentist', dueAt: at(11, 9) });
    await reconcile();
    updateTask(handle.db, task.id, { dueAt: at(11, 14, 15) });
    await reconcile();
    expect(scheduler.list()).toEqual([
      { taskId: task.id, fireAt: at(11, 14, 15), title: 'Dentist' },
    ]);
    updateTask(handle.db, task.id, { title: 'Dentist (bring card)' });
    await reconcile();
    expect(scheduler.list()[0]?.title).toBe('Dentist (bring card)');
  });

  it('AC3: changing to a date-only due date or removing it cancels the reminder', async () => {
    const task = createTask(handle.db, { title: 'x', dueAt: at(11, 9) });
    await reconcile();
    updateTask(handle.db, task.id, { dueAt: at(12) });
    await reconcile();
    expect(scheduler.list()).toEqual([]);
    updateTask(handle.db, task.id, { dueAt: at(12, 8) });
    await reconcile();
    expect(scheduler.list()).toHaveLength(1);
    updateTask(handle.db, task.id, { dueAt: null });
    await reconcile();
    expect(scheduler.list()).toEqual([]);
  });

  it('AC2: completing cancels the reminder; un-completing schedules it again', async () => {
    const task = createTask(handle.db, { title: 'x', dueAt: at(11, 9) });
    const other = createTask(handle.db, { title: 'other', dueAt: at(11, 10) });
    await reconcile();
    updateTask(handle.db, task.id, { status: 'done' });
    await reconcile();
    expect(scheduler.list().map((r) => r.taskId)).toEqual([other.id]);
    updateTask(handle.db, task.id, { status: 'open' });
    await reconcile();
    expect(scheduler.list().map((r) => r.taskId)).toEqual([task.id, other.id]);
  });

  it('AC2: deleting cancels the reminder; undo (restore) schedules it again', async () => {
    const task = createTask(handle.db, { title: 'x', dueAt: at(11, 9) });
    await reconcile();
    softDeleteTask(handle.db, task.id);
    await reconcile();
    expect(scheduler.list()).toEqual([]);
    restoreTask(handle.db, task.id);
    await reconcile();
    expect(scheduler.list()).toEqual([{ taskId: task.id, fireAt: at(11, 9), title: 'x' }]);
  });

  it('does not schedule past due times or date-only / undated tasks', async () => {
    createTask(handle.db, { title: 'past', dueAt: at(10, 11, 59) });
    createTask(handle.db, { title: 'just now', dueAt: NOW - 1 });
    createTask(handle.db, { title: 'date only', dueAt: at(11) });
    createTask(handle.db, { title: 'no date' });
    expect(await reconcile()).toEqual({ scheduled: 0, cancelled: 0, permission: null });
    expect(scheduler.list()).toEqual([]);
  });

  it('keeps a reminder that is firing right now instead of cancelling it', async () => {
    const task = createTask(handle.db, { title: 'x', dueAt: at(10, 12, 1) });
    await reconcile();
    // App opened 1 s after the due time, while the OS may still be delivering it.
    await reconcile({ now: at(10, 12, 1) + 1_000 });
    expect(scheduler.list().map((r) => r.taskId)).toEqual([task.id]);
    expect(DUE_NOW_GRACE_MS).toBeGreaterThan(1_000);
  });

  it(`schedules only the nearest ${MAX_SCHEDULED_REMINDERS} (iOS keeps 64)`, async () => {
    const tasks = Array.from({ length: MAX_SCHEDULED_REMINDERS + 5 }, (_, i) =>
      createTask(handle.db, { title: `t${i}`, dueAt: at(11, 9) + i * 60_000 }),
    );
    await reconcile();
    const pending = scheduler.list();
    expect(pending).toHaveLength(MAX_SCHEDULED_REMINDERS);
    expect(pending.at(-1)?.taskId).toBe(tasks[MAX_SCHEDULED_REMINDERS - 1]?.id);

    // Completing the soonest one lets the next in line in.
    updateTask(handle.db, tasks[0]!.id, { status: 'done' });
    await reconcile();
    expect(scheduler.list().at(-1)?.taskId).toBe(tasks[MAX_SCHEDULED_REMINDERS]?.id);
    expect(scheduler.list()).toHaveLength(MAX_SCHEDULED_REMINDERS);
  });

  describe('permission (minimal until TB-41)', () => {
    it('asks once, after a task write, when a reminder is first needed', async () => {
      scheduler.permission = 'undetermined';
      // Start / foreground / sync never prompt.
      createTask(handle.db, { title: 'x', dueAt: at(11, 9) });
      expect(await reconcile({ mayPrompt: false })).toMatchObject({
        scheduled: 0,
        permission: 'undetermined',
      });
      expect(scheduler.calls.prompts).toBe(0);

      expect(await reconcile({ mayPrompt: true })).toMatchObject({
        scheduled: 1,
        permission: 'granted',
      });
      expect(scheduler.calls.prompts).toBe(1);
    });

    it('does not ask when no reminder is needed', async () => {
      scheduler.permission = 'undetermined';
      createTask(handle.db, { title: 'date only', dueAt: at(11) });
      expect(await reconcile()).toMatchObject({ permission: null });
      expect(scheduler.calls.prompts).toBe(0);
    });

    it('denied: schedules nothing, cancels what was pending, and never asks again', async () => {
      createTask(handle.db, { title: 'x', dueAt: at(11, 9) });
      await reconcile();
      expect(scheduler.list()).toHaveLength(1);

      scheduler.permission = 'denied'; // turned off in system settings
      expect(await reconcile()).toMatchObject({ scheduled: 0, cancelled: 1, permission: 'denied' });
      expect(scheduler.list()).toEqual([]);
      expect(scheduler.calls.prompts).toBe(0);

      scheduler.permission = 'granted'; // turned back on: the next reconcile catches up
      await reconcile({ mayPrompt: false });
      expect(scheduler.list()).toHaveLength(1);
    });

    it('a prompt the user declines leaves nothing scheduled and no error', async () => {
      scheduler.permission = 'undetermined';
      scheduler.promptAnswer = 'denied';
      createTask(handle.db, { title: 'x', dueAt: at(11, 9) });
      expect(await reconcile()).toMatchObject({ scheduled: 0, permission: 'denied' });
      await reconcile();
      expect(scheduler.calls.prompts).toBe(1);
    });
  });
});
