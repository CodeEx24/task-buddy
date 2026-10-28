import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';
import { UndoSnackbar } from '@/features/tasks/components/UndoSnackbar';
import { initCrashReporting, wrapRoot } from '@/lib/crash-reporting';
import { QueryProvider } from '@/lib/QueryProvider';

// TB-37: before any render, so start-up crashes are reported. No-op without a Sentry DSN.
initCrashReporting();

// A deep link straight to a modal (`taskbuddy://task/<id>`) still loads the tabs underneath (TB-18).
export const unstable_settings = { anchor: '(tabs)' };

function RootLayout() {
  return (
    <UiProvider>
      {/* TB-21: run local DB migrations before any screen reads data. */}
      <DbGate>
        {/* TB-26: task data (local SQLite) through TanStack Query. */}
        <QueryProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="task/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
          </Stack>
          {/* Above every screen, so a delete from any modal can be undone (TB-26 AC3). */}
          <UndoSnackbar />
        </QueryProvider>
      </DbGate>
      <StatusBar style="auto" />
    </UiProvider>
  );
}

export default wrapRoot(RootLayout);
