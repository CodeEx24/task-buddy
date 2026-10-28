import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/ui';
import { setColorSchemePreference } from '@/theme';

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
  // Re-theme in the same render as the chip (not a pass later via AppearanceSync's effect).
  // AppearanceSync still follows the stored value, e.g. after a failed write rolls back.
  const chooseTheme = (value: AppearanceTheme) => {
    setColorSchemePreference(value);
    theme.setValue(value);
  };
  // A failed write rolls the chip back; put the theme back to the stored value too.
  const { error, value: storedValue } = theme;
  useEffect(() => {
    if (error) setColorSchemePreference(storedValue);
  }, [error, storedValue]);
  return (
    <View className="gap-sm">
      <ChipGroup
        testID="appearance-theme"
        label="Theme"
        options={THEME_OPTIONS}
        value={theme.value}
        onChange={chooseTheme}
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
