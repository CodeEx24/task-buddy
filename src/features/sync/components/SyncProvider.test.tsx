import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { getDb, openMigratedNodeDb, openUserDb, resetDbForTests } from '@/db/node-client';
import { createTask, getTaskById, updateTask } from '@/features/tasks/repo/task-repo';
import { createQueryClient } from '@/lib/query-client';

import { runSyncCycle } from '../engine/sync-engine';
import { createSyncRemote } from '../remote/remote-factory';
import { useSyncStatusStore } from '../sync-status-store';
import { createFakeSyncServer } from '../testing/fake-sync-server';
import { USER_A } from '../testing/sync-devices';
import { SyncProvider } from './SyncProvider';
import { SYNC_STATUS_COPY, SyncStatus } from './SyncStatus';

jest.mock('../remote/remote-factory', () => ({ createSyncRemote: jest.fn() }));

const server = createFakeSyncServer({ now: () => Date.now() });
const link = server.remoteFor(USER_A);

beforeEach(async () => {
  resetDbForTests();
  await openUserDb(USER_A);
  jest.mocked(createSyncRemote).mockReturnValue(link.remote);
});
afterAll(() => resetDbForTests());

async function renderProvider() {
  const client = createQueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const view = await render(
    <QueryClientProvider client={client}>
      <SyncProvider userId={USER_A} />
      <SyncStatus />
    </QueryClientProvider>,
  );
  return { ...view, client, invalidate };
}

describe('SyncProvider (TB-43)', () => {
  it('syncs on start, shows the status, and pulls when another device changes something', async () => {
    const task = createTask(getDb(), { title: 'Written before sign-in' });
    const { invalidate, unmount, client } = await renderProvider();

    await waitFor(() =>
      expect(server.tables.tasks.get(task.id)?.title).toBe('Written before sign-in'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('sync-status')).toHaveTextContent(SYNC_STATUS_COPY.idle),
    );

    // Another device of the same account edits the task; the server notifies this device.
    const other = openMigratedNodeDb();
    await runSyncCycle({ db: other.db, remote: server.remoteFor(USER_A).remote });
    updateTask(other.db, task.id, { title: 'Edited on the phone' });
    await act(async () => {
      await runSyncCycle({ db: other.db, remote: server.remoteFor(USER_A).remote });
    });

    await waitFor(() => expect(getTaskById(getDb(), task.id)?.title).toBe('Edited on the phone'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] }));

    await unmount();
    expect(useSyncStatusStore.getState().phase).toBe('signed-out');
    other.close();
    client.clear();
  });

  it('shows the offline message when the server cannot be reached', async () => {
    link.setOnline(false);
    const { unmount, client } = await renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('sync-status')).toHaveTextContent(SYNC_STATUS_COPY.offline),
    );
    await unmount();
    link.setOnline(true);
    client.clear();
  });

  it('stays idle when there is no backend (null remote)', async () => {
    jest.mocked(createSyncRemote).mockReturnValue(null);
    const { client, unmount } = await renderProvider();
    expect(screen.queryByTestId('sync-status')).toBeNull();
    await unmount();
    client.clear();
  });
});
