import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Button } from '@/components/ui';

import { LEGAL_URLS, type LegalPage } from '../legal-config';

export type LegalLinksProps = {
  /**
   * `settings` (default): the three links. `sign-in`: adds the "By continuing…" line above them,
   * for the sign-in screen.
   */
  context?: 'settings' | 'sign-in';
  testID?: string;
};

const LINKS: readonly { page: LegalPage; label: string }[] = [
  { page: 'privacy', label: 'Privacy Policy' },
  { page: 'terms', label: 'Terms of Use' },
  { page: 'ai', label: 'How AI uses your data' },
];

export const SIGN_IN_AGREEMENT =
  'By continuing you agree to the Terms of Use and confirm you have read the Privacy Policy, including how AI features use your data.';

/**
 * Links to the published legal pages (TB-54). Opens them in the system browser. Reused by the
 * Settings screen and the sign-in screen; the URLs live in `legal-config.ts`.
 */
export function LegalLinks({ context = 'settings', testID = 'legal-links' }: LegalLinksProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const open = async (url: string) => {
    setFailedUrl(null);
    try {
      await Linking.openURL(url);
    } catch {
      setFailedUrl(url);
    }
  };

  return (
    <View testID={testID} className="gap-xs">
      {context === 'sign-in' ? (
        <Text className="text-center text-sm text-text-muted">{SIGN_IN_AGREEMENT}</Text>
      ) : null}
      <View className="flex-row flex-wrap justify-center">
        {LINKS.map(({ page, label }) => (
          <Button
            key={page}
            testID={`${testID}-${page}`}
            label={label}
            variant="ghost"
            size="sm"
            accessibilityHint="Opens in your browser"
            onPress={() => void open(LEGAL_URLS[page])}
          />
        ))}
      </View>
      {failedUrl ? (
        <Text
          testID={`${testID}-error`}
          accessibilityLiveRegion="polite"
          className="text-center text-sm text-danger"
        >
          {`Couldn't open the page. You can read it at ${failedUrl}`}
        </Text>
      ) : null}
    </View>
  );
}
