import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';
import { QueryCacheReset } from '@/features/auth/components/QueryCacheReset';
import { SessionProvider, useSession } from '@/features/auth/session/SessionProvider';
import { RemindersProvider } from '@/features/notifications/components/RemindersProvider';
import { applyStoredAppearance } from '@/features/settings/apply-stored-appearance';
import { AppearanceSync } from '@/features/settings/components/AppearanceSync';
import { SyncProvider } from '@/features/sync/components/SyncProvider';
import { UndoSnackbar } from '@/features/tasks/components/UndoSnackbar';
import { QueryProvider } from '@/lib/QueryProvider';
import { useTheme } from '@/theme';

// A deep link straight to a modal (`taskbuddy://task/<id>`) still loads the tabs underneath (TB-18).
export const unstable_settings = { anchor: '(tabs)' };

/**
 * TB-20: every app screen requires a session (spec D2-A). Signed out, only `(auth)` and the
 * not-found screen are reachable, so a deep link such as `taskbuddy://task/<id>` lands on sign-in.
 */
function RootNavigator() {
  const { isLoading, isSignedIn, session } = useSession();

  // Blank (like DbGate) while the stored session is read, so sign-in never flashes for a
  // signed-in user.
  if (isLoading) return <View className="flex-1 bg-background" testID="session-gate-pending" />;

  const userId = session?.user.id ?? null;
  return (
    // TB-21 + TB-43: open and migrate the signed-in user's own local DB before any screen reads it.
    // TB-32: then apply that user's stored theme before the first screen renders.
    <DbGate userId={userId} onReady={applyStoredAppearance}>
      {/* TB-32: keep the app theme in step with the Appearance preference (needs the user's DB). */}
      {userId ? <AppearanceSync /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        {/* Guarded URLs redirect instead of falling through to not-found. */}
        <Stack.Protected guard={isSignedIn} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="task/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="dev/db-benchmark" />
        </Stack.Protected>
        <Stack.Protected guard={!isSignedIn} redirectTo="/">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      {/* Above every screen, so a delete from any modal can be undone (TB-26 AC3). */}
      {isSignedIn ? <UndoSnackbar /> : null}
      {/* TB-43: sync with the cloud while signed in; stops on sign-out. */}
      {userId ? <SyncProvider userId={userId} /> : null}
      {/* TB-40: due-time reminders for this account; unmounting (sign-out) cancels them. */}
      {userId ? <RemindersProvider key={userId} /> : null}
      <QueryCacheReset />
    </DbGate>
  );
}

export default function RootLayout() {
  // TB-32: status-bar icons follow the app theme (an in-app Dark on a light device included).
  const { scheme } = useTheme();
  return (
    <UiProvider>
      {/* TB-26: task data (local SQLite) through TanStack Query. */}
      <QueryProvider>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </QueryProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </UiProvider>
  );
}
