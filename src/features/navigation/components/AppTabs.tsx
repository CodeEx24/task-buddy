import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { useTheme } from '@/theme';

import { tabSwitchTimer } from '../tab-switch-timing';
import { APP_TABS, tabButtonTestId } from '../tabs';
import { TabScene } from './TabScene';

/**
 * The app's bottom tab navigator (TB-18): Today, Inbox, Buddy, Settings.
 * Colours come from the theme tokens, so the bar follows the system theme live (TB-17).
 * `lazy: false` mounts every tab at start, so a tab switch only shows an already-rendered screen.
 */
export function AppTabs() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
      screenListeners={({ route, navigation }) => ({
        // Re-tapping the active tab switches nothing, so it starts no measurement.
        tabPress: () => {
          if (!navigation.isFocused()) tabSwitchTimer.markPress(route.name);
        },
      })}
      screenLayout={({ route, navigation, children }) => (
        <TabScene name={route.name} navigation={navigation}>
          {children}
        </TabScene>
      )}
    >
      {APP_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarButtonTestID: tabButtonTestId(tab.name),
            // Same colours as the tint options; the navigator's `color` arg is a wider ColorValue.
            tabBarIcon: ({ size, focused }) => (
              <Ionicons
                name={focused ? tab.icon.focused : tab.icon.default}
                color={focused ? colors.primary : colors.textMuted}
                size={size}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
