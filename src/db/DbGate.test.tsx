import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

// In Jest, `@/db/client` is mapped to this module (better-sqlite3), so these are the same instance.
import * as client from '@/db/node-client';

import { DbGate } from './DbGate';
import { ALL_TABLES, listTables } from './introspect';
import type { TaskBuddyDb } from './types';

const USER_ID = '0190f3b2-0000-7000-8000-00000000a001';

beforeEach(() => client.resetDbForTests());
afterEach(() => jest.restoreAllMocks());

describe('DbGate', () => {
  it('runs migrations, then renders the app', async () => {
    await render(
      <DbGate userId={USER_ID}>
        <Text testID="app">app</Text>
      </DbGate>,
    );

    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    expect(listTables(client.getDb())).toEqual(ALL_TABLES);
  });

  it('shows a retryable error without logging task data, then recovers', async () => {
    const failure = Object.assign(new Error('UNIQUE constraint failed: secret task title'), {
      code: 'SQLITE_CONSTRAINT',
    });
    jest.spyOn(client, 'openUserDb').mockRejectedValueOnce(failure);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <DbGate userId={USER_ID}>
        <Text testID="app">app</Text>
      </DbGate>,
    );

    expect(await screen.findByText("Couldn't open your data")).toBeOnTheScreen();
    expect(screen.queryByTestId('app')).toBeNull();
    expect(log).toHaveBeenCalledWith('[db] migration failed', {
      name: 'Error',
      code: 'SQLITE_CONSTRAINT',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');

    fireEvent.press(screen.getByTestId('db-gate-retry'));

    expect(await screen.findByTestId('app')).toBeOnTheScreen();
  });

  it('signed out: renders without opening a database', async () => {
    const open = jest.spyOn(client, 'openUserDb');
    await render(
      <DbGate userId={null}>
        <Text testID="app">app</Text>
      </DbGate>,
    );
    expect(screen.getByTestId('app')).toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();
  });

  it("TB-43: opens the signed-in user's own database, and switches when the user changes", async () => {
    const other = '0190f3b2-0000-7000-8000-00000000b002';
    const view = await render(
      <DbGate userId={USER_ID}>
        <Text testID="app">app</Text>
      </DbGate>,
    );
    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    const first = client.getDb();

    await view.rerender(
      <DbGate userId={other}>
        <Text testID="app">app</Text>
      </DbGate>,
    );
    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    expect(client.getDb()).not.toBe(first);
  });

  it('calls onReady with the migrated DB before the children first render', async () => {
    const events: string[] = [];
    function App() {
      events.push('app render');
      return <Text testID="app">app</Text>;
    }
    const onReady = jest.fn((db: TaskBuddyDb) => {
      events.push(`ready with ${listTables(db).length} tables`);
    });

    await render(
      <DbGate userId={USER_ID} onReady={onReady}>
        <App />
      </DbGate>,
    );

    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(events[0]).toBe(`ready with ${ALL_TABLES.length} tables`);
    expect(events.slice(1).every((event) => event === 'app render')).toBe(true);
  });
});
