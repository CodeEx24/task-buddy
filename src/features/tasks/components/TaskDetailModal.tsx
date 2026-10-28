import { useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { parseTaskIdParam } from '@/features/navigation/task-id';
import { formatCompletedAt } from '@/lib/dates';
import type { Autosave } from '@/lib/use-autosave';
import { useNow } from '@/lib/use-now';

import { closeTaskModal } from '../close-task-modal';
import { useTask } from '../hooks/use-task-board';
import { useDeleteTask, useUpdateTask } from '../hooks/use-task-mutations';
import { SubtaskChecklist } from './SubtaskChecklist';
import { TaskDetailForm } from './TaskDetailForm';

export const INVALID_TASK_LINK_MESSAGE = "This link doesn't point to a task.";
export const TASK_NOT_FOUND_MESSAGE = "This task doesn't exist anymore.";

function TaskDetailContent({ id }: { id: string }) {
  const task = useTask(id);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const now = useNow();
  const autosave = useRef<Autosave>(null);

  if (task.isPending) return <ActivityIndicator testID="task-detail-loading" />;

  if (!task.data) {
    return (
      <Card testID="task-detail-not-found" title="Task">
        <Text className="text-base text-text">{TASK_NOT_FOUND_MESSAGE}</Text>
      </Card>
    );
  }

  const current = task.data;
  const isDone = current.status === 'done';
  const setStatus = (status: 'open' | 'done') =>
    update.mutate({ id: current.id, patch: { status } });

  return (
    <>
      <Card title="Task">
        {/* Seeded once per task (key), never re-seeded on refetch. */}
        <TaskDetailForm key={current.id} ref={autosave} task={current} />
      </Card>
      <SubtaskChecklist
        key={`subtasks-${current.id}`}
        taskId={current.id}
        isTaskOpen={!isDone}
        onCompleteTask={() => setStatus('done')}
      />
      {isDone && current.completedAt !== null ? (
        <Text testID="task-detail-completed-at" className="text-sm text-text-muted">
          {formatCompletedAt(current.completedAt, now)}
        </Text>
      ) : null}
      <Button
        testID="task-detail-toggle-done"
        label={isDone ? 'Mark as not done' : 'Mark complete'}
        variant="secondary"
        onPress={() => setStatus(isDone ? 'open' : 'done')}
      />
      <Button
        testID="task-detail-delete"
        label="Delete task"
        variant="destructive"
        loading={remove.isPending}
        onPress={async () => {
          try {
            // Save a change still waiting for autosave first, so Undo brings it back too.
            await autosave.current?.flush();
            await remove.mutateAsync(current.id);
            closeTaskModal();
          } catch {
            // Rolled back by the mutation; the task stays open here.
          }
        }}
      />
    </>
  );
}

/**
 * Task detail modal at `/task/[id]` (TB-18; editing since TB-26), also opened by
 * `taskbuddy://task/<id>`. The id is untrusted (deep link): it is validated, shown only as text and
 * never logged. Since TB-28 it edits notes too, autosaves every edit and holds the subtask
 * checklist.
 */
export function TaskDetailModal() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsed = parseTaskIdParam(params.id);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="flex-grow gap-xl p-xl"
        keyboardShouldPersistTaps="handled"
      >
        {parsed.ok ? (
          <View testID="task-detail-modal" className="gap-xl">
            <TaskDetailContent id={parsed.id} />
          </View>
        ) : (
          <Card testID="task-detail-invalid" title="Task">
            <Text className="text-base text-text">{INVALID_TASK_LINK_MESSAGE}</Text>
          </Card>
        )}
        <Button label="Close" variant="secondary" onPress={closeTaskModal} />
      </ScrollView>
    </SafeAreaView>
  );
}
