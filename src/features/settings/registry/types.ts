import type { ComponentType } from 'react';

/** One row of a Settings section. */
export type SettingsRowDefinition =
  /**
   * Opens a registered preference page (`/settings/<slug>`). It references the page object, not a
   * slug string, so a row can't point at a page that doesn't exist.
   */
  | { kind: 'page'; page: SettingsPageDefinition }
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
