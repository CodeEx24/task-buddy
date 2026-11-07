import { Text, View } from 'react-native';

import { useSyncStatusStore } from '../sync-status-store';

export const SYNC_STATUS_COPY = {
  idle: 'All changes backed up.',
  syncing: 'Syncing…',
  offline: "Offline. Changes are saved on this device and sync when you're back online.",
} as const;

/**
 * Sync status row for Settings → Account (TB-43; registered in
 * `features/settings/registry/sections.ts`). Nothing while signed out.
 */
export function SyncStatus() {
  const phase = useSyncStatusStore((state) => state.phase);
  if (phase === 'signed-out') return null;
  return (
    <View testID="settings-sync-status" className="gap-xs py-xs">
      <Text className="text-sm font-medium text-text-muted">Sync</Text>
      <Text testID="sync-status" accessibilityLiveRegion="polite" className="text-base text-text">
        {SYNC_STATUS_COPY[phase]}
      </Text>
    </View>
  );
}
