import { render, screen } from '@testing-library/react-native';
import { sql } from 'drizzle-orm';
import { Appearance, Text } from 'react-native';

import { DbGate } from '@/db/DbGate';
import { getDb, migrateDb, resetDbForTests } from '@/db/node-client';
import { FAKE_USER_ID } from '@/features/auth/testing/fake-auth-client';
import { getColorSchemePreference, setColorSchemePreference } from '@/theme';

import { applyStoredAppearance } from './apply-stored-appearance';
import { appearanceThemePreference } from './preferences/appearance';
import { writePreference } from './repo/preference-repo';

let setNativeColorScheme: jest.SpyInstance;
beforeEach(() => {
  resetDbForTests();
  setColorSchemePreference('system');
  setNativeColorScheme = jest.spyOn(Appearance, 'setColorScheme');
});
afterEach(() => {
  setNativeColorScheme.mockRestore();
  setColorSchemePreference('system');
  resetDbForTests();
});

describe('applyStoredAppearance at start-up (TB-32, no theme flash)', () => {
  it('applies the stored Dark choice before the first screen renders', async () => {
    // A previous session stored Dark (same DB file the next launch opens; TB-43: the signed-in
    // user's DB, which is this file once they claim it).
    await migrateDb(getDb());
    writePreference(getDb(), appearanceThemePreference, 'dark');

    const schemeAtFirstRender: string[] = [];
    function FirstScreen() {
      if (schemeAtFirstRender.length === 0) schemeAtFirstRender.push(getColorSchemePreference());
      return <Text testID="first-screen">today</Text>;
    }

    await render(
      <DbGate userId={FAKE_USER_ID} onReady={applyStoredAppearance}>
        <FirstScreen />
      </DbGate>,
    );

    expect(await screen.findByTestId('first-screen')).toBeOnTheScreen();
    expect(schemeAtFirstRender).toEqual(['dark']);
    // The app theme is JS-only: no native night-mode override (it clipped text on device).
    expect(setNativeColorScheme).not.toHaveBeenCalled();
  });

  it('follows the system when nothing is stored (first launch)', async () => {
    await migrateDb(getDb());
    setColorSchemePreference('light');

    applyStoredAppearance(getDb());

    expect(getColorSchemePreference()).toBe('system');
  });

  it('never throws on a DB failure and leaves the current scheme alone', async () => {
    await migrateDb(getDb());
    getDb().run(sql`DROP TABLE preferences`);

    expect(() => applyStoredAppearance(getDb())).not.toThrow();
    expect(getColorSchemePreference()).toBe('system');
  });
});
