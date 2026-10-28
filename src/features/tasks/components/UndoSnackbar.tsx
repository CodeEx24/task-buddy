import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useUndoStore } from '@/stores/undo-store';

import { useRestoreTask } from '../hooks/use-task-mutations';

/** "Task deleted · Undo", shown for 5 seconds after a delete (TB-26 AC3). */
export function UndoSnackbar() {
  const offer = useUndoStore((state) => state.offer);
  const restore = useRestoreTask();

  if (!offer) return null;

  return (
    <View
      testID="undo-snackbar"
      accessibilityLiveRegion="polite"
      className="absolute bottom-lg left-lg right-lg flex-row items-center justify-between gap-md rounded-md border border-outline bg-surface px-lg py-xs"
    >
      <Text accessibilityRole="alert" className="flex-shrink text-base text-text">
        Task deleted
      </Text>
      <Button
        testID="undo-button"
        label="Undo"
        variant="ghost"
        size="sm"
        loading={restore.isPending}
        onPress={() => restore.mutate(offer.taskId)}
      />
    </View>
  );
}
