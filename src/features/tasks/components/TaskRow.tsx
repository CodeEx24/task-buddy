import { Text, View } from 'react-native';

import { Button, Checkbox } from '@/components/ui';
import { formatCompletedAt, formatDueLabel } from '@/lib/dates';

import { priorityLabel } from '../priority';
import type { Task } from '../repo/task-repo';

/** Secondary line: due date and priority for open tasks, completion time for done ones. */
export function taskMetaLine(task: Task, now: number): string {
  if (task.status === 'done') {
    return task.completedAt === null ? 'Completed' : formatCompletedAt(task.completedAt, now);
  }
  const parts: string[] = [];
  if (task.dueAt !== null) parts.push(formatDueLabel(task.dueAt, now));
  if (task.priority > 0) parts.push(`${priorityLabel(task.priority)} priority`);
  return parts.join(' · ');
}

export type TaskRowProps = {
  task: Task;
  now: number;
  onToggleDone: (task: Task, isDone: boolean) => void;
  onOpen: (task: Task) => void;
};

/** One task in the list (TB-26): complete checkbox, meta line and an Edit button. */
export function TaskRow({ task, now, onToggleDone, onOpen }: TaskRowProps) {
  const meta = taskMetaLine(task, now);
  return (
    <View testID={`task-row-${task.id}`} className="flex-row items-center gap-sm py-xs">
      <View className="flex-1">
        <Checkbox
          testID={`task-checkbox-${task.id}`}
          label={task.title}
          checked={task.status === 'done'}
          onCheckedChange={(isDone) => onToggleDone(task, isDone)}
        />
        {meta ? (
          // Indented under the label (24 pt box + 12 pt gap of the Checkbox primitive).
          <Text testID={`task-meta-${task.id}`} className="pl-[36px] text-sm text-text-muted">
            {meta}
          </Text>
        ) : null}
      </View>
      <Button
        label="Edit"
        accessibilityLabel={`Edit ${task.title}`}
        variant="ghost"
        size="sm"
        onPress={() => onOpen(task)}
      />
    </View>
  );
}
