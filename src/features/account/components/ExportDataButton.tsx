import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';

import { EXPORT_COPY } from '../copy';
import { loadShareModule } from '../export/load-share-module';

/**
 * Settings → Account → "Export my data" (TB-53 AC1; registered in
 * `features/settings/registry/sections.ts`). One tap builds the JSON file from the local DB and
 * opens the OS share sheet. Works offline.
 */
export function ExportDataButton() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setError(null);
    setIsExporting(true);
    try {
      const { shareDataExport } = loadShareModule();
      const result = await shareDataExport({ dialogTitle: EXPORT_COPY.dialogTitle });
      if (!result.ok) setError(EXPORT_COPY[result.reason]);
    } catch {
      setError(EXPORT_COPY.failed);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <View className="gap-xs py-xs">
      <Button
        testID="export-data"
        variant="secondary"
        label={EXPORT_COPY.button}
        accessibilityHint={EXPORT_COPY.hint}
        loading={isExporting}
        onPress={() => void exportData()}
      />
      {error ? (
        <Text
          testID="export-data-error"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
