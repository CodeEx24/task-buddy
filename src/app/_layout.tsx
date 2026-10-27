import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UiProvider } from '@/components/ui';
import { DbGate } from '@/db/DbGate';

export default function RootLayout() {
  return (
    <UiProvider>
      {/* TB-21: run local DB migrations before any screen reads data. */}
      <DbGate>
        <Stack screenOptions={{ headerShown: false }} />
      </DbGate>
      <StatusBar style="auto" />
    </UiProvider>
  );
}
