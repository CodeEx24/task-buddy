import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';
import { QueryProvider } from '@/lib/QueryProvider';

// A deep link straight to a modal (`taskbuddy://task/<id>`) still loads the tabs underneath (TB-18).
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
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
        </QueryProvider>
      </DbGate>
      <StatusBar style="auto" />
    </UiProvider>
  );
}
