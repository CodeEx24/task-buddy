import { diffReminders, planReminders, type ReminderTask } from './reminder-plan';

const at = (d: number, h = 0, min = 0) => new Date(2027, 0, d, h, min).getTime();
const NOW = at(10, 12);

let seq = 0;
function task(overrides: Partial<ReminderTask> = {}): ReminderTask {
  seq += 1;
  return {
    id: `0190f3b2-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    title: `Task ${seq}`,
    status: 'open',
    dueAt: at(11, 9),
    deletedAt: null,
    ...overrides,
  };
}

describe('planReminders (TB-40)', () => {
  it('wants one reminder per open, live task with a future due time, at that time', () => {
    const t = task({ title: 'Call the bank', dueAt: at(10, 15, 30) });
    expect(planReminders([t], NOW, 60)).toEqual([
      { taskId: t.id, fireAt: at(10, 15, 30), title: 'Call the bank' },
    ]);
  });

  it('skips date-only, undated, past, done and deleted tasks', () => {
    const tasks = [
      task({ dueAt: at(11) }), // date-only (local midnight)
      task({ dueAt: null }),
      task({ dueAt: at(10, 11, 59) }), // past
      task({ dueAt: NOW }), // exactly now
      task({ status: 'done' }),
      task({ deletedAt: at(9) }),
    ];
    expect(planReminders(tasks, NOW, 60)).toEqual([]);
  });

  it('keeps only the nearest `cap`, soonest first', () => {
    const tasks = Array.from({ length: 70 }, (_, i) =>
      task({ dueAt: at(11, 9) + (70 - i) * 60_000 }),
    );
    const plan = planReminders(tasks, NOW, 60);
    expect(plan).toHaveLength(60);
    expect(plan[0]?.fireAt).toBe(at(11, 9) + 60_000);
    expect(plan[59]?.fireAt).toBe(at(11, 9) + 60 * 60_000);
    expect(planReminders(tasks, NOW, 0)).toEqual([]);
  });
});

describe('diffReminders (TB-40)', () => {
  const r = (taskId: string, fireAt: number, title = 't') => ({ taskId, fireAt, title });

  it('changes nothing when pending already matches', () => {
    const desired = [r('a', at(11, 9)), r('b', at(12, 9))];
    expect(diffReminders(desired, desired, NOW)).toEqual({ cancel: [], schedule: [] });
  });

  it('schedules new and changed reminders and cancels unwanted ones', () => {
    const desired = [r('new', at(11, 9)), r('moved', at(12, 10)), r('renamed', at(13, 9), 'b')];
    const pending = [r('moved', at(12, 9)), r('renamed', at(13, 9), 'a'), r('gone', at(14, 9))];
    expect(diffReminders(desired, pending, NOW)).toEqual({
      cancel: ['gone'],
      schedule: [desired[0], desired[1], desired[2]],
    });
  });

  it('never schedules a reminder at or before now, but keeps one that is firing', () => {
    const firing = r('firing', NOW - 1_000);
    expect(diffReminders([firing], [firing], NOW)).toEqual({ cancel: [], schedule: [] });
    expect(diffReminders([firing], [], NOW)).toEqual({ cancel: [], schedule: [] });
    // Its time changed to one already past: the stale pending one goes.
    expect(diffReminders([firing], [r('firing', at(15, 9))], NOW)).toEqual({
      cancel: ['firing'],
      schedule: [],
    });
  });
});
