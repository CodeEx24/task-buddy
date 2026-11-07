// Friendly inline notice for a failed AI request (TB-23, https://stratyge.atlassian.net/browse/TB-23).
// TB-29 (quick-add) and later AI screens render it with the result of `mapGatewayError()`.
import { Text } from 'react-native';

import { Card } from '@/components/ui';

import { gatewayErrorMessage, gatewayErrorTitle } from '../copy';
import type { GatewayError } from '../gateway-errors';

export type AiErrorNoticeProps = {
  error: GatewayError;
  testID?: string;
};

export function AiErrorNotice({ error, testID }: AiErrorNoticeProps) {
  const title = gatewayErrorTitle(error);
  const message = gatewayErrorMessage(error);
  return (
    <Card title={title} testID={testID}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="text-base text-muted"
      >
        {message}
      </Text>
    </Card>
  );
}
