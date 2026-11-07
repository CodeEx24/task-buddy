import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { toDateInput } from '@/lib/dates';

import { closeTaskModal } from '../close-task-modal';
import { useCreateTask } from '../hooks/use-task-mutations';
import { EMPTY_TASK_FORM, type TaskFormValues } from '../task-form';
import { parseNewTaskDueParam } from '../task-routes';
import { TaskForm } from './TaskForm';

/**
 * Add-task modal at `/task/new` (TB-26 AC1). The list updates optimistically before the write.
 * `?due=today` (Add task on the Today tab, TB-27) presets the due date to today.
 */
export function NewTaskModal() {
  const create = useCreateTask();
  const { due } = useLocalSearchParams<{ due?: string }>();
  // Read the clock once, outside render (the preset must not change while the form is open).
  const [defaultValues] = useState<TaskFormValues>(() =>
    parseNewTaskDueParam(due) === 'today'
      ? { ...EMPTY_TASK_FORM, dueDate: toDateInput(Date.now()) }
      : EMPTY_TASK_FORM,
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <ScrollView
        testID="new-task-modal"
        contentContainerClassName="flex-grow gap-xl p-xl"
        keyboardShouldPersistTaps="handled"
      >
        <Card title="New task">
          <TaskForm
            defaultValues={defaultValues}
            submitLabel="Save task"
            onSubmit={async (fields) => {
              await create.mutateAsync(fields);
              closeTaskModal();
            }}
          />
        </Card>
        <Button label="Cancel" variant="secondary" onPress={closeTaskModal} />
      </ScrollView>
    </SafeAreaView>
  );
}
