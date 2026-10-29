import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/ui';
import { useSession } from '@/features/auth/session/SessionProvider';

import { deleteAccount } from '../api/delete-account';
import { DELETE_ACCOUNT_COPY } from '../copy';

/**
 * Settings → Account → "Delete account" (TB-53 AC2/AC3; registered in
 * `features/settings/registry/sections.ts`). Three taps from anywhere: the Settings tab, this
 * button, then "Delete" in a destructive confirmation that says exactly what is removed. On
 * success the user is signed out (the route guard shows sign-in) and the device copy is wiped.
 * Offline or on any failure nothing changes and an alert says why.
 */
export function DeleteAccountButton() {
  const { session } = useSession();
  const [isDeleting, setIsDeleting] = useState(false);
  const userId = session?.user.id;
  if (!userId) return null;

  async function runDeletion(id: string) {
    setIsDeleting(true);
    const result = await deleteAccount(id);
    // On success this component is already unmounting (signed out): no state updates.
    if (result.ok) return;
    setIsDeleting(false);
    Alert.alert(DELETE_ACCOUNT_COPY.failedTitle, DELETE_ACCOUNT_COPY[result.reason], [
      { text: DELETE_ACCOUNT_COPY.ok },
    ]);
  }

  function confirmDeletion(id: string) {
    Alert.alert(DELETE_ACCOUNT_COPY.confirmTitle, DELETE_ACCOUNT_COPY.confirmMessage, [
      { text: DELETE_ACCOUNT_COPY.cancel, style: 'cancel' },
      {
        text: DELETE_ACCOUNT_COPY.confirm,
        style: 'destructive',
        onPress: () => void runDeletion(id),
      },
    ]);
  }

  return (
    <Button
      testID="delete-account"
      variant="destructive"
      label={DELETE_ACCOUNT_COPY.button}
      loading={isDeleting}
      onPress={() => confirmDeletion(userId)}
    />
  );
}
