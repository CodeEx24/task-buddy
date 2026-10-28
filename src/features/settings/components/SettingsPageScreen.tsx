import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { Card } from '@/components/ui';

import { findSettingsPage } from '../registry/pages';

export const SETTINGS_PAGE_NOT_FOUND = "This settings page doesn't exist.";

/** `/settings/<slug>` (TB-32): the registered preference page, under a native header with Back. */
export function SettingsPageScreen() {
  const { page: slug } = useLocalSearchParams<{ page: string }>();
  const page = findSettingsPage(slug);

  if (!page) {
    return (
      <ScrollView testID="settings-page-not-found" contentContainerClassName="gap-xl p-xl">
        <Stack.Screen options={{ title: 'Settings' }} />
        <Text className="text-base text-text">{SETTINGS_PAGE_NOT_FOUND}</Text>
      </ScrollView>
    );
  }

  const { Component } = page;
  return (
    <ScrollView testID={`settings-page-${page.slug}`} contentContainerClassName="gap-xl p-xl">
      <Stack.Screen options={{ title: page.title }} />
      <Card>
        <Component />
      </Card>
    </ScrollView>
  );
}
