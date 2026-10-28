import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { createQueryClient } from './query-client';

/** Provides one QueryClient for the app's lifetime (TB-26). Mount once, at the root. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  // Drop the cache (and its garbage-collection timers) when the app root unmounts.
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
