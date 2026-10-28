import { useEffect } from 'react';

import { setColorSchemePreference } from '@/theme';

import { usePreference } from '../hooks/use-preference';
import { appearanceThemePreference } from '../preferences/appearance';

/**
 * Applies the stored theme app-wide (TB-32). `setColorSchemePreference` re-renders every
 * `useTheme` consumer (UiProvider's colour variables, headers, the tab bar, the status bar) in the
 * same pass, including the screen where the choice was made. Mount once, inside the QueryClient
 * provider.
 */
export function AppearanceSync() {
  const { value, isLoading } = usePreference(appearanceThemePreference);
  useEffect(() => {
    // Until the stored value is read, keep what start-up applied (`applyStoredAppearance`).
    if (isLoading) return;
    setColorSchemePreference(value);
  }, [value, isLoading]);
  return null;
}
