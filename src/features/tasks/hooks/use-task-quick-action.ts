import { AccessibilityInfo } from 'react-native';

import type { Task } from '../repo/task-repo';
import { quickActionAnnouncement, quickActionPatch, type TaskQuickAction } from '../task-actions';
import { useUpdateTask } from './use-task-mutations';

/**
 * Runs a row quick action (TB-27 AC2) — from a swipe or its accessibility action — as an
 * optimistic task update, then tells screen-reader users what happened (the row moves away).
 */
export function useTaskQuickAction(): (task: Task, action: TaskQuickAction) => void {
  const update = useUpdateTask();
  return (task, action) => {
    update.mutate({ id: task.id, patch: quickActionPatch(action, task, Date.now()) });
    AccessibilityInfo.announceForAccessibility(quickActionAnnouncement(action, task));
  };
}
