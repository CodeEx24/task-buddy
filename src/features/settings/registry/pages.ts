// Preference pages (TB-32). Each entry becomes a row in the Settings "Preferences" section and a
// page at `/settings/<slug>`; neither the Settings screen nor a route file changes. To add one
// (e.g. TB-33 work hours), write its component and append an entry here.
import { AppearanceSettings } from '../components/AppearanceSettings';
import type { SettingsPageDefinition } from './types';

export const SETTINGS_PAGES: readonly SettingsPageDefinition[] = [
  {
    slug: 'appearance',
    title: 'Appearance',
    description: 'Light, dark or match your device',
    Component: AppearanceSettings,
  },
];

/** The page served at `/settings/<slug>`, or undefined for an unknown slug. */
export function findSettingsPage(slug: string | undefined): SettingsPageDefinition | undefined {
  return SETTINGS_PAGES.find((page) => page.slug === slug);
}

/** Path of a preference page. */
export function settingsPageHref(slug: string): `/settings/${string}` {
  return `/settings/${slug}`;
}
