import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';

import { closeTaskModal } from '../close-task-modal';
import { useCreateTask } from '../hooks/use-task-mutations';
import { TaskForm } from './TaskForm';

/** Add-task modal at `/task/new` (TB-26 AC1). The list updates optimistically before the write. */
export function NewTaskModal() {
  const create = useCreateTask();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <ScrollView
        testID="new-task-modal"
        contentContainerClassName="flex-grow gap-xl p-xl"
        keyboardShouldPersistTaps="handled"
      >
        <Card title="New task">
          <TaskForm
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
