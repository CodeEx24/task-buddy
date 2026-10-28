import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Button, Card, Checkbox, Input, Sheet } from '@/components/ui';
import { APP_NAME } from '@/lib/app-info';

/**
 * Design-system showcase (TB-17): every primitive on one screen, for checking themes on a device.
 * It was the Today tab placeholder until TB-27; now a dev-only route (`/dev/ui-showcase`).
 */
export function UiShowcaseScreen() {
  const [taskName, setTaskName] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const clearForm = () => {
    setTaskName('');
    setIsDone(false);
  };

  return (
    <ScrollView
      testID="ui-showcase-screen"
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow justify-center gap-xl p-xl"
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" className="text-center text-2xl font-bold text-text">
        {APP_NAME}
      </Text>

      <Card title="Try the buddy">
        <Input
          label="Task name"
          placeholder="e.g. Buy milk"
          helperText="Type a task to try the input."
          value={taskName}
          onChangeText={setTaskName}
        />
        <Checkbox label="Mark as done" checked={isDone} onCheckedChange={setIsDone} />
        <Button label="Open sheet" onPress={() => setIsSheetOpen(true)} />
        <Button label="Clear" variant="ghost" onPress={clearForm} />
      </Card>

      <Sheet
        testID="home-sheet"
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title="Your buddy"
      >
        <Text className="text-base text-text-muted">
          Sheets hold quick actions and details. Swipe down, tap outside or press Back to close.
        </Text>
        <Button label="Close" variant="secondary" onPress={() => setIsSheetOpen(false)} />
      </Sheet>
    </ScrollView>
  );
}
