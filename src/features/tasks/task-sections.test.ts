import { newId } from '@/lib/ids';

import type { Task } from './repo/task-repo';
import { groupTaskBoard, openSectionFor } from './task-sections';

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

describe('task sections', () => {
  it('puts overdue and today in Today, later in Upcoming, undated in No date', () => {
    expect(openSectionFor({ dueAt: local(2026, 10, 1) }, NOW)).toBe('today');
    expect(openSectionFor({ dueAt: local(2026, 10, 28) }, NOW)).toBe('today');
    expect(openSectionFor({ dueAt: local(2026, 10, 29) }, NOW)).toBe('upcoming');
    expect(openSectionFor({ dueAt: null }, NOW)).toBe('no-date');
  });

  it('orders sections and tasks, and hides empty sections', () => {
    // Created in this order, so ids (UUIDv7) ascend.
    const lowToday = task({ title: 'low today', dueAt: local(2026, 10, 28), priority: 1 });
    const highToday = task({ title: 'high today', dueAt: local(2026, 10, 28), priority: 3 });
    const overdue = task({ title: 'overdue', dueAt: local(2026, 10, 20) });
    const nextWeek = task({ title: 'next week', dueAt: local(2026, 11, 4) });
    const undatedA = task({ title: 'undated a' });
    const undatedB = task({ title: 'undated b' });
    const doneEarly = task({ title: 'done early', status: 'done', completedAt: 1 });
    const doneLate = task({ title: 'done late', status: 'done', completedAt: 2 });

    const sections = groupTaskBoard(
      {
        open: [undatedB, nextWeek, lowToday, undatedA, highToday, overdue],
        completed: [doneEarly, doneLate],
      },
      NOW,
    );

    expect(sections.map((s) => [s.title, s.data.map((t) => t.title)])).toEqual([
      ['Today', ['overdue', 'high today', 'low today']],
      ['Upcoming', ['next week']],
      ['No date', ['undated a', 'undated b']],
      ['Completed', ['done late', 'done early']],
    ]);
    expect(groupTaskBoard({ open: [undatedA], completed: [] }, NOW).map((s) => s.key)).toEqual([
      'no-date',
    ]);
    expect(groupTaskBoard({ open: [], completed: [] }, NOW)).toEqual([]);
  });
});
