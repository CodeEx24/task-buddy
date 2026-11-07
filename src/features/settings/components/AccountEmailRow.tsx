import { Text, View } from 'react-native';

import { useAccountEmail } from '../hooks/use-account-email';

export const SIGNED_OUT_EMAIL_LABEL = 'Not signed in';

/** Account section: the email the user signed in with (TB-32 AC1). */
export function AccountEmailRow() {
  const email = useAccountEmail();
  return (
    <View testID="settings-account-email" className="gap-xs py-xs">
      <Text className="text-sm font-medium text-text-muted">Email</Text>
      <Text testID="settings-account-email-value" selectable className="text-base text-text">
        {email ?? SIGNED_OUT_EMAIL_LABEL}
      </Text>
    </View>
  );
}
