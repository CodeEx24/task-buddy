import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDbMigrations } from './use-db-migrations';

/**
 * Renders children only once the local DB is migrated (TB-21 AC1). Blank while migrating;
 * a retryable error screen if the DB can't be opened or migrated.
 */
export function DbGate({ children }: { children: ReactNode }) {
  const { status, retry } = useDbMigrations();

  if (status === 'pending') return <View style={styles.fill} testID="db-gate-pending" />;

  if (status === 'error') {
    return (
      <View style={[styles.fill, styles.center]} testID="db-gate-error">
        <Text style={styles.title} accessibilityRole="header">
          {"Couldn't open your data"}
        </Text>
        <Text style={styles.body}>Your tasks are still on this device. Please try again.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={styles.button}
          testID="db-gate-retry"
        >
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, borderWidth: 1 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
});
