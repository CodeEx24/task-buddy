import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { parseTaskIdParam } from '@/features/navigation/task-id';
import { formatCompletedAt } from '@/lib/dates';
import { useNow } from '@/lib/use-now';

import { closeTaskModal } from '../close-task-modal';
import { useTask } from '../hooks/use-task-board';
import { useDeleteTask, useUpdateTask } from '../hooks/use-task-mutations';
import { toTaskFormValues } from '../task-form';
import { TaskForm } from './TaskForm';

export const INVALID_TASK_LINK_MESSAGE = "This link doesn't point to a task.";
export const TASK_NOT_FOUND_MESSAGE = "This task doesn't exist anymore.";

function TaskDetailContent({ id }: { id: string }) {
  const task = useTask(id);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const now = useNow();

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

  return (
    <>
      <Card title="Edit task">
        <TaskForm
          // Re-seed the form only when another task is shown, never on refetch.
          key={current.id}
          defaultValues={toTaskFormValues(current)}
          submitLabel="Save changes"
          onSubmit={async (fields) => {
            await update.mutateAsync({ id: current.id, patch: fields });
            closeTaskModal();
          }}
        />
      </Card>
      {isDone && current.completedAt !== null ? (
        <Text testID="task-detail-completed-at" className="text-sm text-text-muted">
          {formatCompletedAt(current.completedAt, now)}
        </Text>
      ) : null}
      <Button
        testID="task-detail-toggle-done"
        label={isDone ? 'Mark as not done' : 'Mark complete'}
        variant="secondary"
        onPress={() =>
          update.mutate({ id: current.id, patch: { status: isDone ? 'open' : 'done' } })
        }
      />
      <Button
        testID="task-detail-delete"
        label="Delete task"
        variant="destructive"
        loading={remove.isPending}
        onPress={async () => {
          try {
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
 * Task detail modal at `/task/[id]` (TB-18, editing since TB-26), also opened by
 * `taskbuddy://task/<id>`. The id is untrusted (deep link): it is validated, shown only as text and
 * never logged. Notes and subtasks come with TB-28.
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
