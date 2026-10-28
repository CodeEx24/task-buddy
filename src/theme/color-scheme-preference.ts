// The app's own light/dark choice (TB-32), kept in JS so every mounted screen re-renders the
// moment it changes.
//
// Why not `Appearance.setColorScheme`: in React Native 0.88 it only updates the cached value and
// relies on Android's configuration-change event to notify `useColorScheme` subscribers, so
// screens that are already on screen keep the old colours. It also forces a native night-mode
// configuration change under text that is already measured, which left button labels clipped on
// device. The device scheme still comes from `useColorScheme` when the choice is 'system'.
import { useSyncExternalStore } from 'react';

import type { ColorScheme } from './tokens';

/** 'system' follows the device; 'light'/'dark' override it inside the app. */
export type ColorSchemePreference = 'system' | ColorScheme;

let current: ColorSchemePreference = 'system';
const listeners = new Set<() => void>();

export function getColorSchemePreference(): ColorSchemePreference {
  return current;
}

/** Re-themes every mounted screen synchronously (no native round trip). */
export function setColorSchemePreference(next: ColorSchemePreference): void {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useColorSchemePreference(): ColorSchemePreference {
  return useSyncExternalStore(subscribe, getColorSchemePreference, getColorSchemePreference);
}
