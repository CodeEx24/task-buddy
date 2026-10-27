import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@/lib/app-info';

/** Placeholder home route (TB-15). The tab shell replaces this in TB-18. */
export function HomeScreen() {
  return (
    <View style={styles.container} testID="home-screen">
      <Text style={styles.title} accessibilityRole="header">
        {APP_NAME}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
});
