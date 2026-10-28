import { SignOutButton } from '@/features/auth/components/SignOutButton';

import { PlaceholderScreen } from './PlaceholderScreen';

/** Settings tab. Placeholder until TB-32 (Settings screen shell) replaces it; sign-out from TB-20. */
export function SettingsScreen() {
  return (
    <PlaceholderScreen
      testID="settings-screen"
      title="Settings"
      note="Your preferences will live here."
    >
      <SignOutButton />
    </PlaceholderScreen>
  );
}
