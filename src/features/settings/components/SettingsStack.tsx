import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Stack inside the Settings tab (TB-32): the Settings list, then preference pages pushed on top
 * with a native header and Back, keeping the tab bar visible. Header colours follow the theme.
 */
export function SettingsStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* The list draws its own large title, like the other tabs. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Settings' }} />
      <Stack.Screen name="[page]" options={{ headerBackTitle: 'Settings' }} />
    </Stack>
  );
}
