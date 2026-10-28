import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { colors, type ColorScheme, type Palette } from './tokens';

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
};

/** Resolves the active colour scheme from the system appearance. Unknown/null falls back to light. */
export function resolveScheme(value: string | null | undefined): ColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

// The app's own light/dark choice (TB-32), kept in JS so every mounted screen re-renders the
// moment it changes. Not `Appearance.setColorScheme`: on React Native 0.88 Android it emits no
// change event for already-mounted `useColorScheme` subscribers, so the screen you are on keeps
// the old colours, and it forces a native night-mode configuration change. For 'system' the
// device scheme still comes from `useColorScheme`.

/** 'system' follows the device; 'light'/'dark' override it inside the app. */
export type ColorSchemePreference = 'system' | ColorScheme;

let currentPreference: ColorSchemePreference = 'system';
const preferenceListeners = new Set<() => void>();

export function getColorSchemePreference(): ColorSchemePreference {
  return currentPreference;
}

/** Re-themes every mounted screen synchronously (no native round trip). */
export function setColorSchemePreference(next: ColorSchemePreference): void {
  if (next === currentPreference) return;
  currentPreference = next;
  preferenceListeners.forEach((listener) => listener());
}

function subscribeToPreference(listener: () => void): () => void {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}

export function useColorSchemePreference(): ColorSchemePreference {
  return useSyncExternalStore(
    subscribeToPreference,
    getColorSchemePreference,
    getColorSchemePreference,
  );
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
