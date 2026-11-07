import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';

export type PlaceholderScreenProps = {
  /** Screen heading, announced as a header. */
  title: string;
  /** One line telling the user what will live here. */
  note: string;
  testID: string;
  /** Optional content below the note (for example Settings' sign-out button, TB-20). */
  children?: ReactNode;
};

/**
 * Placeholder for a tab whose feature hasn't shipped yet (TB-18). The owning ticket replaces the
 * wrapper screen (`BuddyScreen`, …) without touching the route file.
 */
export function PlaceholderScreen({ title, note, testID, children }: PlaceholderScreenProps) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView testID={testID} contentContainerClassName="flex-grow gap-xl p-xl">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {title}
        </Text>
        <Card>
          <Text className="text-base text-text-muted">{note}</Text>
        </Card>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
