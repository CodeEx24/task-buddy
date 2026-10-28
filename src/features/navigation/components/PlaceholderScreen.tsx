import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';

export type PlaceholderScreenProps = {
  /** Screen heading, announced as a header. */
  title: string;
  /** One line telling the user what will live here. */
  note: string;
  testID: string;
};

/**
 * Placeholder for a tab whose feature hasn't shipped yet (TB-18). The owning ticket replaces the
 * wrapper screen (`BuddyScreen`, …) without touching the route file.
 */
export function PlaceholderScreen({ title, note, testID }: PlaceholderScreenProps) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView testID={testID} contentContainerClassName="flex-grow gap-xl p-xl">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {title}
        </Text>
        <Card>
          <Text className="text-base text-text-muted">{note}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
