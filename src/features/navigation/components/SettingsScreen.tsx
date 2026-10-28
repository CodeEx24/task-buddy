import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { LegalLinks } from '@/features/legal/components/LegalLinks';
import { SyncStatus } from '@/features/sync/components/SyncStatus';

import { PlaceholderScreen } from './PlaceholderScreen';

/**
 * Settings tab. Placeholder until TB-32 (Settings screen shell) replaces it; sign-out from TB-20,
 * legal links from TB-54, sync status from TB-43.
 */
export function SettingsScreen() {
  return (
    <PlaceholderScreen
      testID="settings-screen"
      title="Settings"
      note="Your preferences will live here."
    >
      <SyncStatus />
      <SignOutButton />
      <LegalLinks testID="settings-legal-links" />
    </PlaceholderScreen>
  );
}
