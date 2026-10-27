import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UiProvider } from '@/components/ui';

export default function RootLayout() {
  return (
    <UiProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </UiProvider>
  );
}
