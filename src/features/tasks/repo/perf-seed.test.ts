import { getDb, migrateDb, resetDbForTests } from '@/db/node-client';
import { startOfLocalDay } from '@/lib/dates';

import { groupInboxTasks, groupTodayTasks } from '../task-sections';
import { PERF_TASK_COUNT, removePerfTasks, seedPerfTasks } from './perf-seed';
import { createTask, listOpenTasks } from './task-repo';

const NOW = new Date(2026, 9, 28, 15).getTime();

beforeEach(async () => {
  resetDbForTests();
  await migrateDb(getDb());
});
afterAll(resetDbForTests);

describe('perf seed (TB-27 AC3 device check)', () => {
  it('seeds 500 open tasks across Overdue, Today, Later and the Inbox', () => {
    seedPerfTasks(getDb(), NOW);

    const open = listOpenTasks(getDb(), { limit: 500 }).items;
    expect(open).toHaveLength(PERF_TASK_COUNT);
    const board = { open, completed: [] };
    const today = groupTodayTasks(board, NOW).map((s) => [s.key, s.data.length]);
    const inbox = groupInboxTasks(board).map((s) => [s.key, s.data.length]);
    expect(today).toEqual([
      ['overdue', 100],
      ['today', 100],
      ['later', 150],
    ]);
    expect(inbox).toEqual([['no-date', 150]]);
    expect(open.filter((t) => t.dueAt === startOfLocalDay(NOW))).toHaveLength(100);
  });

  it('removes only the perf tasks', () => {
    const mine = createTask(getDb(), { title: 'Perfume shopping' });
    seedPerfTasks(getDb(), NOW, 20);

    expect(removePerfTasks(getDb(), NOW)).toBe(20);
    expect(listOpenTasks(getDb()).items.map((t) => t.id)).toEqual([mine.id]);
    expect(removePerfTasks(getDb(), NOW)).toBe(0);
  });
});
