import type { ComponentType } from 'react';

/** One row of a Settings section. */
export type SettingsRowDefinition =
  /** Opens a preference page (`/settings/<slug>`). */
  | { kind: 'page'; id: string; title: string; description?: string; slug: string }
  /** Renders its own content (account email, sign-out button, …). */
  | { kind: 'custom'; id: string; Component: ComponentType };

/** A titled group of rows on the Settings screen. */
export type SettingsSectionDefinition = {
  id: string;
  title: string;
  rows: readonly SettingsRowDefinition[];
};

/** A preference page, opened from the Preferences section and served at `/settings/<slug>`. */
export type SettingsPageDefinition = {
  /** URL segment: lowercase kebab-case. */
  slug: string;
  title: string;
  /** One line under the title in the Preferences list. */
  description: string;
  /** The page body; it reads and writes its preferences with `usePreference`. */
  Component: ComponentType;
};
