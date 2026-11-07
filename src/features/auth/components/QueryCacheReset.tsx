import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useUndoStore } from '@/stores/undo-store';

import { useSession } from '../session/SessionProvider';

/**
 * Drops every cached query and any pending undo when the user signs out (or the session is
 * revoked), so nothing from the previous session is served from memory (TB-20, spec D7-A).
 * Renders nothing; mount inside QueryProvider and SessionProvider.
 */
export function QueryCacheReset() {
  const client = useQueryClient();
  const { isSignedIn } = useSession();
  const wasSignedIn = useRef(isSignedIn);

  useEffect(() => {
    if (wasSignedIn.current && !isSignedIn) {
      client.clear();
      useUndoStore.getState().dismissUndo();
    }
    wasSignedIn.current = isSignedIn;
  }, [client, isSignedIn]);

  return null;
}
