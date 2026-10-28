import { z } from 'zod';

import { definePreference } from './define-preference';

export const APPEARANCE_THEMES = ['system', 'light', 'dark'] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export const appearanceThemeSchema = z.enum(APPEARANCE_THEMES);

/** Light, dark, or follow the system (default). Applied app-wide by `AppearanceSync`. */
export const appearanceThemePreference = definePreference<AppearanceTheme>({
  key: 'appearance.theme',
  schema: appearanceThemeSchema,
  defaultValue: 'system',
});

/** React Native `Appearance.setColorScheme` value: `'auto'` removes the override. */
export function toColorSchemeOverride(theme: AppearanceTheme): 'light' | 'dark' | 'auto' {
  return theme === 'system' ? 'auto' : theme;
}
