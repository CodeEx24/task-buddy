// Groups the task board into the list's sections (TB-26, spec "Behaviour"). Pure.
import { localDaysFromToday } from '@/lib/dates';

import type { Task } from './repo/task-repo';

export type TaskBoard = { open: Task[]; completed: Task[] };

export type TaskSectionKey = 'today' | 'upcoming' | 'no-date' | 'completed';

export type TaskSection = { key: TaskSectionKey; title: string; data: Task[] };

const SECTION_TITLES: Record<TaskSectionKey, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  'no-date': 'No date',
  completed: 'Completed',
};
const SECTION_ORDER: readonly TaskSectionKey[] = ['today', 'upcoming', 'no-date', 'completed'];

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Which open section a task belongs in. Overdue tasks count as Today. */
export function openSectionFor(task: Pick<Task, 'dueAt'>, now: number): TaskSectionKey {
  if (task.dueAt === null) return 'no-date';
  return localDaysFromToday(task.dueAt, now) <= 0 ? 'today' : 'upcoming';
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

/** Non-empty sections in display order: Today, Upcoming, No date, Completed. */
export function groupTaskBoard(board: TaskBoard, now: number): TaskSection[] {
  const buckets: Record<TaskSectionKey, Task[]> = {
    today: [],
    upcoming: [],
    'no-date': [],
    completed: [...board.completed].sort(compareCompletedTasks),
  };
  for (const task of [...board.open].sort(compareOpenTasks)) {
    buckets[openSectionFor(task, now)].push(task);
  }
  return SECTION_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    data: buckets[key],
  }));
}
