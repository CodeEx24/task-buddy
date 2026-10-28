import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';

import { parseTaskIdParam } from '../task-id';

export const INVALID_TASK_LINK_MESSAGE = "This link doesn't point to a task.";

/** Closes the modal, or goes to Today when it was opened with nothing underneath. */
function closeTaskModal() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/**
 * Task detail modal at `/task/[id]` (TB-18), also opened by `taskbuddy://task/<id>`.
 * Placeholder until TB-26/TB-28 load and edit the task. The id is untrusted (deep link): it is
 * validated, shown only as text and never logged.
 */
export function TaskDetailModal() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsed = parseTaskIdParam(params.id);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow gap-xl p-xl">
        {parsed.ok ? (
          <Card testID="task-detail-modal" title="Task">
            <Text className="text-base text-text-muted">Task details are coming soon.</Text>
            <Text selectable className="text-sm text-text-muted">
              ID: {parsed.id}
            </Text>
          </Card>
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
