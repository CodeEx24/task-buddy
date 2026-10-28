import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useUndoStore } from '@/stores/undo-store';

import { useRestoreTask } from '../hooks/use-task-mutations';

/** Space kept free under the snackbar for the bottom tab bar (about 49 pt) plus a margin. */
const TAB_BAR_CLEARANCE = 64;

/**
 * "Task deleted · Undo", shown for 5 seconds after a delete (TB-26 AC3). Rendered once by the root
 * layout, above every screen, so it shows wherever the delete happened.
 */
export function UndoSnackbar() {
  const offer = useUndoStore((state) => state.offer);
  const restore = useRestoreTask();
  const insets = useSafeAreaInsets();

  if (!offer) return null;

  return (
    <View
      testID="undo-snackbar"
      accessibilityLiveRegion="polite"
      style={{ bottom: insets.bottom + TAB_BAR_CLEARANCE }}
      className="absolute left-lg right-lg flex-row items-center justify-between gap-md rounded-md border border-outline bg-surface px-lg py-xs"
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
