// TanStack Query client for local-first data (TB-26). All task data comes from the on-device
// SQLite repositories, so nothing here depends on the network.
import { QueryClient } from '@tanstack/react-query';

/**
 * - `networkMode: 'always'`: queries and mutations read/write the local DB, so they must never
 *   pause while the device is offline.
 * - `staleTime: Infinity`: local data only changes through our own mutations, which invalidate
 *   the affected queries.
 * - `retry: false`: a local SQLite failure does not heal on retry; surface it at once.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'always', staleTime: Infinity, retry: false },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}
