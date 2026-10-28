// Settings sections (TB-32), in display order. The Settings screen renders exactly this list, so
// a later story adds a row by editing this file (or `pages.ts` for a preference page), never the
// screen. The Account section reuses TB-20's sign-out button (confirm dialog included) as a
// `custom` row; the Legal section shows TB-54's legal links.
import { SignOutButton } from '@/features/auth/components/SignOutButton';

import { AccountEmailRow } from '../components/AccountEmailRow';
import { SettingsLegalLinksRow } from '../components/SettingsLegalLinksRow';
import { SETTINGS_PAGES } from './pages';
import type { SettingsSectionDefinition } from './types';

export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: 'account',
    title: 'Account',
    rows: [
      { kind: 'custom', id: 'account-email', Component: AccountEmailRow },
      { kind: 'custom', id: 'sign-out', Component: SignOutButton },
    ],
  },
  {
    id: 'preferences',
    title: 'Preferences',
    rows: SETTINGS_PAGES.map((page) => ({ kind: 'page', page })),
  },
  {
    id: 'legal',
    title: 'Legal',
    rows: [{ kind: 'custom', id: 'legal-links', Component: SettingsLegalLinksRow }],
  },
];
