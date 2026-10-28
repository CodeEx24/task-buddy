// Row quick actions (TB-27 AC2): what a swipe or the matching accessibility action does. Pure.
// Swipe right toggles done; swipe left moves an open task to tomorrow. Every swipe has a
// non-gesture twin: the same action in the row's accessibility actions (VoiceOver / TalkBack),
// the row checkbox for done, and the edit modal's Tomorrow chip for rescheduling.
import type { SwipeSide } from '@/components/ui/swipe-row-config';
import { addLocalDays } from '@/lib/dates';

import type { Task } from './repo/task-repo';
import type { UpdateTaskInput } from './schema';

export type TaskQuickAction = 'toggle-done' | 'tomorrow';

/** The direction the finger moved (`SwipeRow`'s `SwipeSide`). */
export type SwipeDirectionName = SwipeSide;

/** Swipe right → complete (or reopen a done task); swipe left → tomorrow. */
export function quickActionForSwipe(direction: SwipeDirectionName): TaskQuickAction {
  return direction === 'right' ? 'toggle-done' : 'tomorrow';
}

/** Done tasks can only be reopened; rescheduling applies to open tasks. */
export function availableQuickActions(task: Pick<Task, 'status'>): TaskQuickAction[] {
  return task.status === 'done' ? ['toggle-done'] : ['toggle-done', 'tomorrow'];
}

/** The repository patch for an action, given the moment it runs. */
export function quickActionPatch(
  action: TaskQuickAction,
  task: Pick<Task, 'status'>,
  now: number,
): UpdateTaskInput {
  if (action === 'tomorrow') return { dueAt: addLocalDays(now, 1) };
  return { status: task.status === 'done' ? 'open' : 'done' };
}

/** Short label for the swipe panel and the accessibility action menu. */
export function quickActionLabel(action: TaskQuickAction, task: Pick<Task, 'status'>): string {
  if (action === 'tomorrow') return 'Move to tomorrow';
  return task.status === 'done' ? 'Mark as not done' : 'Complete';
}

/** What a screen reader announces after the action ran (the row moves away from focus). */
export function quickActionAnnouncement(
  action: TaskQuickAction,
  task: Pick<Task, 'status' | 'title'>,
): string {
  if (action === 'tomorrow') return `${task.title} moved to tomorrow`;
  return task.status === 'done' ? `${task.title} marked as not done` : `${task.title} completed`;
}
