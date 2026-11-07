import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/ui';

import { signOut } from '../api/auth-api';
import { SIGN_OUT_COPY } from '../copy';

/**
 * Settings entry point for sign-out (TB-20 AC3). Confirms first; local tasks stay on the device
 * (spec D7-A). The route guard shows sign-in once the session is gone.
 */
export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  function confirmSignOut() {
    Alert.alert(SIGN_OUT_COPY.confirmTitle, SIGN_OUT_COPY.confirmMessage, [
      { text: SIGN_OUT_COPY.cancel, style: 'cancel' },
      {
        text: SIGN_OUT_COPY.confirm,
        style: 'destructive',
        onPress: () => {
          setIsSigningOut(true);
          void signOut().finally(() => setIsSigningOut(false));
        },
      },
    ]);
  }

  return (
    <Button
      testID="sign-out"
      variant="secondary"
      label={SIGN_OUT_COPY.button}
      loading={isSigningOut}
      onPress={confirmSignOut}
    />
  );
}
