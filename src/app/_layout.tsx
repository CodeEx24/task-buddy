import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';
import { QueryCacheReset } from '@/features/auth/components/QueryCacheReset';
import { SessionProvider, useSession } from '@/features/auth/session/SessionProvider';
import { SyncProvider } from '@/features/sync/components/SyncProvider';
import { UndoSnackbar } from '@/features/tasks/components/UndoSnackbar';
import { QueryProvider } from '@/lib/QueryProvider';

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
    <DbGate userId={userId}>
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
      <QueryCacheReset />
    </DbGate>
  );
}

export default function RootLayout() {
  return (
    <UiProvider>
      {/* TB-26: task data (local SQLite) through TanStack Query. */}
      <QueryProvider>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </QueryProvider>
      <StatusBar style="auto" />
    </UiProvider>
  );
}
