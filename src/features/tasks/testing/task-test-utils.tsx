// Test helpers for task screens (TB-26). Screens read the shared Jest app DB (`@/db/client` is
// mapped to the better-sqlite3 twin), so each test starts from an empty, migrated DB.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { getDb, migrateDb, resetDbForTests } from '@/db/node-client';
import { tasks, type TaskRow } from '@/db/schema';
import { createQueryClient } from '@/lib/query-client';
import { useUndoStore } from '@/stores/undo-store';

const clients: QueryClient[] = [];

/** A phone-sized frame with no insets, as the app root provides on device. */
const TEST_SAFE_AREA: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** A QueryClient that `resetTaskData` clears, so no cache timers outlive the test. */
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient();
  // No garbage-collection timers in tests: they would outlive the test and keep Jest alive.
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { ...client.getDefaultOptions().mutations, gcTime: Infinity },
  });
  clients.push(client);
  return client;
}

/** Drops cached queries, the pending undo (and their timers) and the DB. Run after each test. */
export function cleanupTaskTests(): void {
  for (const client of clients.splice(0)) client.clear();
  useUndoStore.getState().dismissUndo();
  resetDbForTests();
}

/** Fresh empty DB with every migration applied, no cached queries and no pending undo. */
export async function resetTaskData(): Promise<void> {
  cleanupTaskTests();
  await migrateDb(getDb());
}

/** Renders `ui` with its own QueryClient (a new client = a cold app start). */
export async function renderWithQuery(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient(),
) {
  const result = await render(
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...result, client };
}

/** The stored row, deleted or not, to assert what SQLite holds (soft delete included). */
export function storedTask(id: string): TaskRow | undefined {
  return getDb().select().from(tasks).where(eq(tasks.id, id)).get();
}
