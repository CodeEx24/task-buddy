import { openMigratedNodeDb, type NodeDb } from '@/db/node-client';
import { createTask } from '@/features/tasks/repo/task-repo';

import {
  requestReminderReconcile,
  setActiveReminderSession,
  startReminderSession,
} from './reminder-session';
import { createFakeReminderScheduler } from './testing/fake-reminder-scheduler';

const at = (d: number, h = 0, min = 0) => new Date(2027, 0, d, h, min).getTime();
const NOW = at(10, 12);
const now = () => NOW;

let handles: NodeDb[] = [];
const openDb = () => {
  const handle = openMigratedNodeDb();
  handles.push(handle);
  return handle.db;
};
afterEach(() => {
  setActiveReminderSession(null);
  for (const handle of handles) handle.close();
  handles = [];
});

describe('reminder session (TB-40)', () => {
  it('coalesces requests made while a reconcile waits, keeping any permission to prompt', async () => {
    const db = openDb();
    const scheduler = createFakeReminderScheduler({ permission: 'undetermined' });
    createTask(db, { title: 'x', dueAt: at(11, 9) });
    const session = startReminderSession({ db, scheduler, now });

    const getPermission = jest.spyOn(scheduler, 'getPermission');
    await Promise.all([
      session.request({ mayPrompt: false }),
      session.request({ mayPrompt: true }),
      session.request({ mayPrompt: false }),
    ]);
    expect(getPermission).toHaveBeenCalledTimes(1);
    expect(scheduler.calls.prompts).toBe(1);
    expect(scheduler.list()).toHaveLength(1);
  });

  it('sign-out: stop cancels every reminder and later requests do nothing', async () => {
    const db = openDb();
    const scheduler = createFakeReminderScheduler();
    createTask(db, { title: 'x', dueAt: at(11, 9) });
    const session = startReminderSession({ db, scheduler, now });
    await session.request({ mayPrompt: false });
    expect(scheduler.list()).toHaveLength(1);

    await session.stop();
    expect(scheduler.list()).toEqual([]);
    expect(scheduler.calls.cancelAll).toBe(1);

    await session.request({ mayPrompt: true });
    expect(scheduler.list()).toEqual([]);
  });

  it("account switch: the previous account's reminders are cancelled before the next account's are set", async () => {
    const scheduler = createFakeReminderScheduler();
    const dbA = openDb();
    const dbB = openDb();
    const taskA = createTask(dbA, { title: 'A', dueAt: at(11, 9) });
    const taskB = createTask(dbB, { title: 'B', dueAt: at(11, 10) });

    const sessionA = startReminderSession({ db: dbA, scheduler, now });
    await sessionA.request({ mayPrompt: false });
    expect(scheduler.list().map((r) => r.taskId)).toEqual([taskA.id]);

    // A request queued right before the switch must not schedule A's reminders after it.
    const late = sessionA.request({ mayPrompt: false });
    const stopped = sessionA.stop();
    const sessionB = startReminderSession({ db: dbB, scheduler, now });
    await Promise.all([late, stopped, sessionB.request({ mayPrompt: false })]);

    expect(scheduler.list().map((r) => r.taskId)).toEqual([taskB.id]);
  });

  it('sync pulls reach the active session only', async () => {
    const db = openDb();
    const scheduler = createFakeReminderScheduler();
    const session = startReminderSession({ db, scheduler, now });
    const request = jest.spyOn(session, 'request');

    requestReminderReconcile(); // signed out: nothing to do
    expect(request).not.toHaveBeenCalled();

    setActiveReminderSession(session);
    requestReminderReconcile();
    expect(request).toHaveBeenCalledWith({ mayPrompt: false });
  });

  it('a failing scheduler is logged without task content and does not block later jobs', async () => {
    const db = openDb();
    const scheduler = createFakeReminderScheduler();
    createTask(db, { title: 'Secret title', dueAt: at(11, 9) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(scheduler, 'listScheduled').mockRejectedValueOnce(new Error('Secret title'));
    const session = startReminderSession({ db, scheduler, now });

    await session.request({ mayPrompt: false });
    expect(warn).toHaveBeenCalledWith('[reminders] reconcile failed', { name: 'Error' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Secret title');

    await session.request({ mayPrompt: false });
    expect(scheduler.list()).toHaveLength(1);
    warn.mockRestore();
  });
});
