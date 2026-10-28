import { memo, useRef } from 'react';
import { Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { Task } from '../repo/task-repo';
import {
  availableQuickActions,
  quickActionForSwipe,
  quickActionLabel,
  type TaskQuickAction,
} from '../task-actions';
import { TaskRow, type TaskRowProps } from './TaskRow';

/** Width of the panel a swipe reveals. */
export const SWIPE_PANEL_WIDTH = 120;
/** Release past this distance (60 % of the panel) to commit; less snaps the row back. */
export const SWIPE_COMMIT_DISTANCE = 72;

type SwipeActionPanelProps = { action: TaskQuickAction; task: Task; side: 'left' | 'right' };

/**
 * What the swipe uncovers. Decorative for assistive tech: the same actions are the checkbox's
 * accessibility actions (TaskRow), so the panel is hidden from screen readers.
 */
function SwipeActionPanel({ action, task, side }: SwipeActionPanelProps) {
  const isDoneToggle = action === 'toggle-done';
  return (
    <View
      testID={`task-swipe-${action}-${task.id}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: SWIPE_PANEL_WIDTH }}
      className={`justify-center px-md ${side === 'left' ? 'items-start' : 'items-end'} ${
        isDoneToggle ? 'bg-primary' : 'bg-surface'
      }`}
    >
      <Text
        className={`text-sm font-semibold ${isDoneToggle ? 'text-on-primary' : 'text-primary'}`}
      >
        {quickActionLabel(action, task)}
      </Text>
    </View>
  );
}

/** Same task content: every column is a primitive, so a shallow field check is exact. */
function isSameTask(a: Task, b: Task): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof Task)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Re-render only when the label, a callback or the task's content changed. */
export function areRowPropsEqual(prev: TaskRowProps, next: TaskRowProps): boolean {
  return (
    prev.meta === next.meta &&
    prev.onToggleDone === next.onToggleDone &&
    prev.onOpen === next.onOpen &&
    prev.onQuickAction === next.onQuickAction &&
    isSameTask(prev.task, next.task)
  );
}

/**
 * A task row with swipe actions (TB-27 AC2): swipe right to complete (or reopen a done task),
 * swipe left to move an open task to tomorrow. The gesture and its spring run on the UI thread
 * (gesture-handler's ReanimatedSwipeable); the action fires once, when the panel opens.
 * Memoised: with the list's stable callbacks, a row re-renders only when its task's content or
 * its label changes. Task objects are compared by field, because every SQLite refetch returns
 * new objects for unchanged rows.
 */
export const SwipeableTaskRow = memo(function SwipeableTaskRow(props: TaskRowProps) {
  const { task, onQuickAction } = props;
  const swipeRef = useRef<SwipeableMethods>(null);
  const canReschedule = availableQuickActions(task).includes('tomorrow');

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      testID={`task-swipe-${task.id}`}
      leftThreshold={SWIPE_COMMIT_DISTANCE}
      rightThreshold={SWIPE_COMMIT_DISTANCE}
      overshootFriction={8}
      renderLeftActions={() => <SwipeActionPanel action="toggle-done" task={task} side="left" />}
      renderRightActions={
        canReschedule
          ? () => <SwipeActionPanel action="tomorrow" task={task} side="right" />
          : undefined
      }
      onSwipeableOpen={(direction) => {
        swipeRef.current?.close();
        onQuickAction(task, quickActionForSwipe(direction));
      }}
    >
      <TaskRow {...props} />
    </ReanimatedSwipeable>
  );
}, areRowPropsEqual);
