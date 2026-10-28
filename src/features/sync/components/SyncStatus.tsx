import { Text } from 'react-native';

import { useSyncStatusStore } from '../sync-status-store';

export const SYNC_STATUS_COPY = {
  idle: 'All changes backed up.',
  syncing: 'Syncing…',
  offline: "Offline. Changes are saved on this device and sync when you're back online.",
} as const;

/** One line of sync status for Settings (TB-43). Nothing while signed out. */
export function SyncStatus() {
  const phase = useSyncStatusStore((state) => state.phase);
  if (phase === 'signed-out') return null;
  return (
    <Text className="text-sm text-text-muted" testID="sync-status" accessibilityLiveRegion="polite">
      {SYNC_STATUS_COPY[phase]}
    </Text>
  );
}
