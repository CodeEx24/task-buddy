import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';
import { QueryCacheReset } from '@/features/auth/components/QueryCacheReset';
import { SessionProvider, useSession } from '@/features/auth/session/SessionProvider';
import { applyStoredAppearance } from '@/features/settings/apply-stored-appearance';
import { AppearanceSync } from '@/features/settings/components/AppearanceSync';
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
  const { isLoading, isSignedIn } = useSession();

  // Blank (like DbGate) while the stored session is read, so sign-in never flashes for a
  // signed-in user.
  if (isLoading) return <View className="flex-1 bg-background" testID="session-gate-pending" />;

  return (
    <>
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
      <QueryCacheReset />
    </>
  );
}

export default function RootLayout() {
  // TB-32: status-bar icons follow the app theme (an in-app Dark on a light device included).
  const { scheme } = useTheme();
  return (
    <UiProvider>
      {/* TB-21: run local DB migrations before any screen reads data.
          TB-32: then apply the stored theme before the first screen renders. */}
      <DbGate onReady={applyStoredAppearance}>
        {/* TB-26: task data (local SQLite) through TanStack Query. */}
        <QueryProvider>
          {/* TB-32: keep the app theme in step with the Appearance preference. */}
          <AppearanceSync />
          <SessionProvider>
            <RootNavigator />
          </SessionProvider>
        </QueryProvider>
      </DbGate>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </UiProvider>
  );
}
