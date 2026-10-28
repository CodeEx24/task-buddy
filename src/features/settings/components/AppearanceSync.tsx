import { useEffect } from 'react';
import { Appearance } from 'react-native';

import { usePreference } from '../hooks/use-preference';
import { appearanceThemePreference, toColorSchemeOverride } from '../preferences/appearance';

/**
 * Applies the stored theme app-wide (TB-32). `Appearance.setColorScheme` is an app-level override
 * that `useColorScheme` (and so `useTheme`, the tab bar and native alerts/pickers) follows, so a
 * change re-styles every screen at once. Mount once, inside the QueryClient provider.
 */
export function AppearanceSync() {
  const { value, isLoading } = usePreference(appearanceThemePreference);
  useEffect(() => {
    // Until the stored value is read, keep what the app started with (the system scheme).
    if (isLoading) return;
    Appearance.setColorScheme(toColorSchemeOverride(value));
  }, [value, isLoading]);
  return null;
}
