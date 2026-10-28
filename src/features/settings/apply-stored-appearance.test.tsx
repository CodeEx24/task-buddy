import { render, screen } from '@testing-library/react-native';
import { sql } from 'drizzle-orm';
import { Appearance, Text } from 'react-native';

import { DbGate } from '@/db/DbGate';
import { getDb, migrateDb, resetDbForTests } from '@/db/node-client';

import { applyStoredAppearance } from './apply-stored-appearance';
import { appearanceThemePreference } from './preferences/appearance';
import { writePreference } from './repo/preference-repo';

let setColorScheme: jest.SpyInstance;
beforeEach(() => {
  resetDbForTests();
  setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});
afterEach(() => {
  setColorScheme.mockRestore();
  resetDbForTests();
});

describe('applyStoredAppearance at start-up (TB-32, no theme flash)', () => {
  it('applies the stored Dark override before the first screen renders', async () => {
    // A previous session stored Dark (same DB file the next launch opens).
    await migrateDb(getDb());
    writePreference(getDb(), appearanceThemePreference, 'dark');
    setColorScheme.mockClear();

    const overrideAtFirstRender: unknown[][] = [];
    function FirstScreen() {
      if (overrideAtFirstRender.length === 0) {
        overrideAtFirstRender.push(...setColorScheme.mock.calls);
      }
      return <Text testID="first-screen">today</Text>;
    }

    await render(
      <DbGate onReady={applyStoredAppearance}>
        <FirstScreen />
      </DbGate>,
    );

    expect(await screen.findByTestId('first-screen')).toBeOnTheScreen();
    expect(overrideAtFirstRender).toEqual([['dark']]);
  });

  it('clears any override for System (first launch, nothing stored)', async () => {
    await migrateDb(getDb());

    applyStoredAppearance(getDb());

    expect(setColorScheme).toHaveBeenCalledWith('auto');
  });

  it('never throws on a DB failure and leaves the system scheme alone', async () => {
    await migrateDb(getDb());
    getDb().run(sql`DROP TABLE preferences`);

    expect(() => applyStoredAppearance(getDb())).not.toThrow();
    expect(setColorScheme).not.toHaveBeenCalled();
  });
});
