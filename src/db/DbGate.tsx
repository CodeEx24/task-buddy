import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';

import { useDbMigrations } from './use-db-migrations';

/**
 * Renders children only once the signed-in user's local DB is open and migrated (TB-21 AC1,
 * TB-43: one DB per account). Blank while migrating; a retryable error screen if the DB can't be
 * opened or migrated. Signed out (`userId` null) it renders children without opening a DB.
 * Must sit inside `UiProvider` (the error screen uses the design-system theme).
 */
export function DbGate({ userId, children }: { userId: string | null; children: ReactNode }) {
  const { status, retry } = useDbMigrations(userId);

  if (status === 'pending') {
    return <View className="flex-1 bg-background" testID="db-gate-pending" />;
  }

  if (status === 'error') {
    return (
      <View
        className="flex-1 items-center justify-center gap-md bg-background p-xl"
        testID="db-gate-error"
      >
        <Text accessibilityRole="header" className="text-center text-lg font-semibold text-text">
          {"Couldn't open your data"}
        </Text>
        <Text className="text-center text-base text-text-muted">
          Your tasks are still on this device. Please try again.
        </Text>
        <Button label="Try again" onPress={retry} testID="db-gate-retry" />
      </View>
    );
  }

  return <>{children}</>;
}
