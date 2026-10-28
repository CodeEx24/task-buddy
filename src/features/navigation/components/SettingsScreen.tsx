import { LegalLinks } from '@/features/legal/components/LegalLinks';

import { PlaceholderScreen } from './PlaceholderScreen';

/** Settings tab. Placeholder until TB-32 (Settings screen shell) replaces it; legal links from TB-54. */
export function SettingsScreen() {
  return (
    <PlaceholderScreen
      testID="settings-screen"
      title="Settings"
      note="Your preferences will live here."
    >
      <LegalLinks testID="settings-legal-links" />
    </PlaceholderScreen>
  );
}
