import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { getDb, openMigratedNodeDb, openUserDb, resetDbForTests } from '@/db/node-client';
import { RemindersProvider } from '@/features/notifications/components/RemindersProvider';
import { createFakeReminderScheduler } from '@/features/notifications/testing/fake-reminder-scheduler';
import { createTask, getTaskById, updateTask } from '@/features/tasks/repo/task-repo';
import { addLocalDays } from '@/lib/dates';
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

  it('TB-40: a pulled change to a due time, or a completion, reconciles the reminders', async () => {
    const dueAt = addLocalDays(Date.now(), 2) + 9 * 60 * 60_000; // 09:00, in two days
    const task = createTask(getDb(), { title: 'Dentist', dueAt });
    const scheduler = createFakeReminderScheduler();
    const client = createQueryClient();
    const { unmount } = await render(
      <QueryClientProvider client={client}>
        <SyncProvider userId={USER_A} />
        <RemindersProvider scheduler={scheduler} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(scheduler.list()).toEqual([{ taskId: task.id, fireAt: dueAt, title: 'Dentist' }]),
    );
    await waitFor(() => expect(server.tables.tasks.get(task.id)).toBeDefined());

    // Another device moves the due time by an hour.
    const other = openMigratedNodeDb();
    await runSyncCycle({ db: other.db, remote: server.remoteFor(USER_A).remote });
    updateTask(other.db, task.id, { dueAt: dueAt + 60 * 60_000 });
    await act(async () => {
      await runSyncCycle({ db: other.db, remote: server.remoteFor(USER_A).remote });
    });
    await waitFor(() => expect(scheduler.list()[0]?.fireAt).toBe(dueAt + 60 * 60_000));

    // ... then completes the task there.
    updateTask(other.db, task.id, { status: 'done' });
    await act(async () => {
      await runSyncCycle({ db: other.db, remote: server.remoteFor(USER_A).remote });
    });
    await waitFor(() => expect(scheduler.list()).toEqual([]));

    await unmount();
    other.close();
    client.clear();
  });
});
