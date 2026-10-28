import { newId } from '@/lib/ids';

import type { Task } from './repo/task-repo';
import { dueGroupFor, groupInboxTasks, groupTodayTasks, screenFor } from './task-sections';

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();
const NOW = local(2026, 10, 28, 15);

function task(overrides: Partial<Task>): Task {
  return {
    id: newId(),
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    listId: null,
    title: 'task',
    notes: null,
    status: 'open',
    priority: 0,
    dueAt: null,
    completedAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('task sections (TB-27)', () => {
  it('splits dated tasks into Overdue, Today and Later by local day; undated go to the Inbox', () => {
    expect(dueGroupFor(local(2026, 10, 1), NOW)).toBe('overdue');
    expect(dueGroupFor(local(2026, 10, 27, 23), NOW)).toBe('overdue');
    expect(dueGroupFor(local(2026, 10, 28), NOW)).toBe('today');
    expect(dueGroupFor(local(2026, 10, 28, 23), NOW)).toBe('today');
    expect(dueGroupFor(local(2026, 10, 29), NOW)).toBe('later');
    expect(screenFor({ dueAt: null })).toBe('inbox');
    expect(screenFor({ dueAt: local(2026, 10, 1) })).toBe('today');
  });

  // Created in this order, so ids (UUIDv7) ascend.
  const lowToday = task({ title: 'low today', dueAt: local(2026, 10, 28), priority: 1 });
  const highToday = task({ title: 'high today', dueAt: local(2026, 10, 28), priority: 3 });
  const overdueOld = task({ title: 'overdue old', dueAt: local(2026, 10, 2) });
  const overdue = task({ title: 'overdue', dueAt: local(2026, 10, 20) });
  const nextWeek = task({ title: 'next week', dueAt: local(2026, 11, 4) });
  const tomorrow = task({ title: 'tomorrow', dueAt: local(2026, 10, 29) });
  const undatedA = task({ title: 'undated a' });
  const undatedB = task({ title: 'undated b', priority: 2 });
  const doneDatedEarly = task({
    title: 'done dated early',
    dueAt: 1,
    status: 'done',
    completedAt: 1,
  });
  const doneDatedLate = task({
    title: 'done dated late',
    dueAt: 1,
    status: 'done',
    completedAt: 3,
  });
  const doneUndated = task({ title: 'done undated', status: 'done', completedAt: 2 });
  const board = {
    open: [undatedA, nextWeek, lowToday, undatedB, highToday, overdue, tomorrow, overdueOld],
    completed: [doneDatedEarly, doneUndated, doneDatedLate],
  };
  const titles = (sections: ReturnType<typeof groupTodayTasks>) =>
    sections.map((s) => [s.title, s.data.map((t) => t.title)]);

  it('Today shows Overdue, Today, Later and its completed tasks, in order (AC1)', () => {
    expect(titles(groupTodayTasks(board, NOW))).toEqual([
      ['Overdue', ['overdue old', 'overdue']],
      ['Today', ['high today', 'low today']],
      ['Later', ['tomorrow', 'next week']],
      ['Completed', ['done dated late', 'done dated early']],
    ]);
  });

  it('Inbox shows undated tasks (priority first, then creation) and its completed tasks (AC1)', () => {
    expect(titles(groupInboxTasks(board))).toEqual([
      ['No date', ['undated b', 'undated a']],
      ['Completed', ['done undated']],
    ]);
  });

  it('hides empty sections', () => {
    expect(groupTodayTasks({ open: [tomorrow], completed: [] }, NOW).map((s) => s.key)).toEqual([
      'later',
    ]);
    expect(groupTodayTasks({ open: [undatedA], completed: [doneUndated] }, NOW)).toEqual([]);
    expect(groupInboxTasks({ open: [overdue], completed: [doneDatedLate] })).toEqual([]);
    expect(groupInboxTasks({ open: [], completed: [] })).toEqual([]);
  });
});
