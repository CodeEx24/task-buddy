import { useColorScheme } from 'react-native';

import { useColorSchemePreference } from './color-scheme-preference';
import { colors, type ColorScheme, type Palette } from './tokens';

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
};

/** Resolves the active colour scheme from the system appearance. Unknown/null falls back to light. */
export function resolveScheme(value: string | null | undefined): ColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

/**
 * The current theme: the in-app choice (`setColorSchemePreference`, TB-32) or, for 'system', the
 * device appearance. Re-renders when either changes.
 * Use class names (`bg-surface`) for styling; use this hook only for props that cannot take a
 * class name (spinner colour, placeholder colour, third-party style props).
 */
export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const preference = useColorSchemePreference();
  const scheme = preference === 'system' ? resolveScheme(systemScheme) : preference;
  return { scheme, colors: colors[scheme] };
}
