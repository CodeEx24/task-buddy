import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';

import { SETTINGS_SECTIONS } from '../registry/sections';
import type { SettingsRowDefinition, SettingsSectionDefinition } from '../registry/types';
import { SettingsPageRow } from './SettingsPageRow';

function SettingsRow({ row }: { row: SettingsRowDefinition }) {
  if (row.kind === 'page') {
    return (
      <SettingsPageRow
        id={row.id}
        title={row.title}
        description={row.description}
        slug={row.slug}
      />
    );
  }
  const { Component } = row;
  return <Component />;
}

export type SettingsScreenProps = {
  /** Defaults to the app registry; tests pass their own to prove the screen is registry-driven. */
  sections?: readonly SettingsSectionDefinition[];
};

/**
 * Settings tab (TB-32): renders the section registry (`../registry/sections.ts`) in order, so
 * stories add rows there without editing this screen.
 */
export function SettingsScreen({ sections = SETTINGS_SECTIONS }: SettingsScreenProps) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView testID="settings-screen" contentContainerClassName="flex-grow gap-xl p-xl">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          Settings
        </Text>
        {sections.map((section) => (
          <View key={section.id} testID={`settings-section-${section.id}`} className="gap-sm">
            <Text accessibilityRole="header" className="text-sm font-semibold text-text-muted">
              {section.title}
            </Text>
            <Card className="gap-sm">
              {section.rows.map((row) => (
                <SettingsRow key={row.id} row={row} />
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
