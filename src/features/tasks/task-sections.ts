// Groups the task board into the Today and Inbox screens' sections (TB-27 spec "Behaviour"). Pure.
// Dated tasks live on Today (Overdue / Today / Later), undated ones in the Inbox; each screen
// lists its own completed tasks last, so un-completing (TB-26 AC2) stays one tap away.
import { localDaysFromToday } from '@/lib/dates';

import type { Task } from './repo/task-repo';

export type TaskBoard = { open: Task[]; completed: Task[] };

/** The tab a task is listed on. */
export type TaskScreenKind = 'today' | 'inbox';

export type DueGroupKey = 'overdue' | 'today' | 'later';

export type TaskSectionKey = DueGroupKey | 'no-date' | 'completed';

export type TaskSection = { key: TaskSectionKey; title: string; data: Task[] };

const SECTION_TITLES: Record<TaskSectionKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  later: 'Later',
  'no-date': 'No date',
  completed: 'Completed',
};

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Dated tasks are planned (Today tab); undated ones wait in the Inbox. */
export function screenFor(task: Pick<Task, 'dueAt'>): TaskScreenKind {
  return task.dueAt === null ? 'inbox' : 'today';
}

/** Overdue = due before today's local date, Today = due today, Later = after today. */
export function dueGroupFor(dueAt: number, now: number): DueGroupKey {
  const days = localDaysFromToday(dueAt, now);
  if (days < 0) return 'overdue';
  return days === 0 ? 'today' : 'later';
}

/** Due date ascending (none last), then priority (high first), then id (UUIDv7 = creation order). */
export function compareOpenTasks(a: Task, b: Task): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt - b.dueAt;
  }
  if (a.priority !== b.priority) return b.priority - a.priority;
  return compareIds(a.id, b.id);
}

/** Most recently completed first. */
export function compareCompletedTasks(a: Task, b: Task): number {
  const diff = (b.completedAt ?? 0) - (a.completedAt ?? 0);
  return diff !== 0 ? diff : compareIds(b.id, a.id);
}

function toSections(
  order: readonly TaskSectionKey[],
  buckets: Partial<Record<TaskSectionKey, Task[]>>,
): TaskSection[] {
  return order.flatMap((key) => {
    const data = buckets[key] ?? [];
    return data.length > 0 ? [{ key, title: SECTION_TITLES[key], data }] : [];
  });
}

const completedOn = (board: TaskBoard, kind: TaskScreenKind) =>
  board.completed.filter((task) => screenFor(task) === kind).sort(compareCompletedTasks);

/** Today tab: non-empty Overdue, Today, Later and Completed (dated tasks only), in that order. */
export function groupTodayTasks(board: TaskBoard, now: number): TaskSection[] {
  const buckets: Record<DueGroupKey, Task[]> = { overdue: [], today: [], later: [] };
  for (const task of [...board.open].sort(compareOpenTasks)) {
    if (task.dueAt !== null) buckets[dueGroupFor(task.dueAt, now)].push(task);
  }
  return toSections(['overdue', 'today', 'later', 'completed'], {
    ...buckets,
    completed: completedOn(board, 'today'),
  });
}

/** Inbox tab: non-empty No date and Completed (undated tasks only). */
export function groupInboxTasks(board: TaskBoard): TaskSection[] {
  const open = board.open.filter((task) => task.dueAt === null).sort(compareOpenTasks);
  return toSections(['no-date', 'completed'], {
    'no-date': open,
    completed: completedOn(board, 'inbox'),
  });
}
