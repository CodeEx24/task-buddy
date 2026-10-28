import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';
import { applyStoredAppearance } from '@/features/settings/apply-stored-appearance';
import { AppearanceSync } from '@/features/settings/components/AppearanceSync';
import { UndoSnackbar } from '@/features/tasks/components/UndoSnackbar';
import { QueryProvider } from '@/lib/QueryProvider';

// A deep link straight to a modal (`taskbuddy://task/<id>`) still loads the tabs underneath (TB-18).
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  return (
    <UiProvider>
      {/* TB-21: run local DB migrations before any screen reads data.
          TB-32: then apply the stored theme before the first screen renders. */}
      <DbGate onReady={applyStoredAppearance}>
        {/* TB-26: task data (local SQLite) through TanStack Query. */}
        <QueryProvider>
          {/* TB-32: keep the app theme in step with the Appearance preference. */}
          <AppearanceSync />
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
