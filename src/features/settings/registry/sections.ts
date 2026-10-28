// Settings sections (TB-32), in display order. The Settings screen renders exactly this list, so
// a later story adds a row by editing this file (or `pages.ts` for a preference page), never the
// screen. TB-20 adds its sign-out button as a `custom` row in the Account section.
import { AccountEmailRow } from '../components/AccountEmailRow';
import { SETTINGS_PAGES } from './pages';
import type { SettingsSectionDefinition } from './types';

export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: 'account',
    title: 'Account',
    rows: [{ kind: 'custom', id: 'account-email', Component: AccountEmailRow }],
  },
  {
    id: 'preferences',
    title: 'Preferences',
    rows: SETTINGS_PAGES.map((page) => ({ kind: 'page', page })),
  },
];
