// Test crash trigger (TB-37): proves a JS error and a native crash reach Sentry with readable
// stack traces. Open `taskbuddy://dev/crash-test`. Dev builds and the staging (preview) build only;
// production shows Not Found. Logic lives in src/lib/crash-reporting; this route only renders it.
import { ScrollView, Text } from 'react-native';

import { Button, Card } from '@/components/ui';

import {
  captureException,
  isCrashReportingEnabled,
  isTestCrashAvailable,
  TEST_CRASH_MESSAGE,
  triggerTestCrash,
} from '@/lib/crash-reporting';

import NotFoundScreen from '../+not-found';

function CrashTestScreen() {
  const isEnabled = isCrashReportingEnabled();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-md p-xl"
      testID="crash-test-screen"
    >
      <Text accessibilityRole="header" className="text-xl font-semibold text-text">
        Crash reporting check
      </Text>
      <Card title="Status">
        <Text className="text-base text-text" testID="crash-reporting-status">
          {isEnabled ? 'Sentry is on' : 'Sentry is off (no valid EXPO_PUBLIC_SENTRY_DSN)'}
        </Text>
      </Card>

      <Button
        label="Send a handled error"
        onPress={() => captureException(new Error(`${TEST_CRASH_MESSAGE} (handled)`))}
        testID="crash-test-handled"
      />
      <Button
        label="Throw a JS error"
        variant="destructive"
        onPress={() => triggerTestCrash('js')}
        testID="crash-test-js"
      />
      <Button
        label="Crash the native layer"
        variant="destructive"
        onPress={() => triggerTestCrash('native')}
        testID="crash-test-native"
      />
      <Text className="text-base text-text-muted">
        Native crash closes the app. Reopen it so the report uploads.
      </Text>
    </ScrollView>
  );
}

export default function CrashTestRoute() {
  return isTestCrashAvailable() ? <CrashTestScreen /> : <NotFoundScreen />;
}
