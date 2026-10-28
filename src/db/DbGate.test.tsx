import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

// In Jest, `@/db/client` is mapped to this module (better-sqlite3), so these are the same instance.
import * as client from '@/db/node-client';

import { DbGate } from './DbGate';
import { APP_TABLES, listTables } from './introspect';

beforeEach(() => client.resetDbForTests());
afterEach(() => jest.restoreAllMocks());

describe('DbGate', () => {
  it('runs migrations, then renders the app', async () => {
    await render(
      <DbGate>
        <Text testID="app">app</Text>
      </DbGate>,
    );

    expect(await screen.findByTestId('app')).toBeOnTheScreen();
    expect(listTables(client.getDb())).toEqual([...APP_TABLES].sort());
  });

  it('shows a retryable error without logging task data, then recovers', async () => {
    const failure = Object.assign(new Error('UNIQUE constraint failed: secret task title'), {
      code: 'SQLITE_CONSTRAINT',
    });
    jest.spyOn(client, 'migrateDb').mockRejectedValueOnce(failure);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <DbGate>
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
});
