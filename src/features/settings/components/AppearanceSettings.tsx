import { Text, View } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/ui';

import { usePreference } from '../hooks/use-preference';
import { appearanceThemePreference, type AppearanceTheme } from '../preferences/appearance';

const THEME_OPTIONS: readonly ChipOption<AppearanceTheme>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const APPEARANCE_SAVE_ERROR = "Couldn't save your choice. Try again.";

/** Appearance page (TB-32): the theme applies as soon as a chip is tapped (`AppearanceSync`). */
export function AppearanceSettings() {
  const theme = usePreference(appearanceThemePreference);
  return (
    <View className="gap-sm">
      <ChipGroup
        testID="appearance-theme"
        label="Theme"
        options={THEME_OPTIONS}
        value={theme.value}
        onChange={theme.setValue}
      />
      <Text className="text-sm text-text-muted">
        System follows your device&apos;s light or dark mode.
      </Text>
      {theme.error ? (
        <Text
          testID="appearance-theme-error"
          accessibilityRole="alert"
          className="text-sm text-danger"
        >
          {APPEARANCE_SAVE_ERROR}
        </Text>
      ) : null}
    </View>
  );
}
