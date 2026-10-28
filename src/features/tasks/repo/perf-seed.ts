// TB-27 AC3 device check: seed the app DB with N tasks spread over Overdue / Today / Later and the
// Inbox, so the Today and Inbox lists can be scrolled at the size the AC names (500). Dev-only
// (`/dev/perf-tasks`); rows are tagged by a title prefix and contain no user data.
import { and, isNull, like } from 'drizzle-orm';

import { tasks, type TaskRow } from '@/db/schema';
import type { TaskBuddyDb } from '@/db/types';
import { addLocalDays, startOfLocalDay } from '@/lib/dates';
import { newId } from '@/lib/ids';

export const PERF_TASK_COUNT = 500;
export const PERF_TITLE_PREFIX = 'Perf task';

/** Due day for the i-th task: 20 % overdue, 20 % today, 30 % later, 30 % undated. */
function perfDueAt(i: number, today: number): number | null {
  const slot = i % 10;
  if (slot < 2) return addLocalDays(today, -1 - (i % 14));
  if (slot < 4) return today;
  if (slot < 7) return addLocalDays(today, 1 + (i % 30));
  return null;
}

/** Inserts `count` open perf tasks in one transaction. */
export function seedPerfTasks(db: TaskBuddyDb, now: number, count = PERF_TASK_COUNT): void {
  const today = startOfLocalDay(now);
  const rows: TaskRow[] = Array.from({ length: count }, (_, i) => ({
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    listId: null,
    title: `${PERF_TITLE_PREFIX} ${String(i + 1).padStart(3, '0')}`,
    notes: null,
    status: 'open',
    priority: i % 4,
    dueAt: perfDueAt(i, today),
    completedAt: null,
    sortOrder: i,
  }));
  db.transaction((tx) => {
    // SQLite caps bound variables per statement; 100 rows × 12 columns stays well under it.
    for (let start = 0; start < rows.length; start += 100) {
      tx.insert(tasks)
        .values(rows.slice(start, start + 100))
        .run();
    }
  });
}

/** Soft-deletes every live perf task. Returns how many. */
export function removePerfTasks(db: TaskBuddyDb, now: number): number {
  return db
    .update(tasks)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(like(tasks.title, `${PERF_TITLE_PREFIX} %`), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id })
    .all().length;
}
