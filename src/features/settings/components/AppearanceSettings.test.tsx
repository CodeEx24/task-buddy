import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { sql } from 'drizzle-orm';
import { Appearance } from 'react-native';

import { getDb } from '@/db/client';
import {
  cleanupTaskTests,
  createTestQueryClient,
  renderWithQuery,
  resetTaskData,
} from '@/features/tasks/testing/task-test-utils';
import { getColorSchemePreference, setColorSchemePreference } from '@/theme';

import { preferenceQueryKeys } from '../hooks/use-preference';
import { appearanceThemePreference } from '../preferences/appearance';
import { readPreference } from '../repo/preference-repo';
import { APPEARANCE_SAVE_ERROR, AppearanceSettings } from './AppearanceSettings';
import { AppearanceSync } from './AppearanceSync';

let setNativeColorScheme: jest.SpyInstance;

beforeEach(async () => {
  await resetTaskData();
  setColorSchemePreference('system');
  setNativeColorScheme = jest.spyOn(Appearance, 'setColorScheme');
});
afterEach(() => {
  // The app theme is JS-only: never a native night-mode override (it clipped text on device).
  expect(setNativeColorScheme).not.toHaveBeenCalled();
  setNativeColorScheme.mockRestore();
  setColorSchemePreference('system');
  cleanupTaskTests();
});

const appScheme = getColorSchemePreference;

function AppearancePage() {
  return (
    <>
      <AppearanceSync />
      <AppearanceSettings />
    </>
  );
}

const chip = (name: string) => screen.getByRole('radio', { name });

describe('Appearance preference (TB-32 AC2)', () => {
  it('starts on System and leaves the system scheme in charge', async () => {
    await renderWithQuery(<AppearancePage />);

    await waitFor(() => expect(chip('System')).toBeChecked());
    expect(appScheme()).toBe('system');
    expect(chip('Dark')).not.toBeChecked();
  });

  it('applies a choice at once and stores it locally', async () => {
    await renderWithQuery(<AppearancePage />);
    await waitFor(() => expect(chip('System')).toBeChecked());

    await fireEvent.press(chip('Dark'));

    // The cache changes in the press handler; TanStack Query re-renders observers in a 0 ms batch
    // that `fireEvent` doesn't wait for, hence `waitFor` (no DB read is involved).
    await waitFor(() => expect(chip('Dark')).toBeChecked());
    expect(appScheme()).toBe('dark');
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('dark'));

    await fireEvent.press(chip('Light'));
    await waitFor(() => expect(appScheme()).toBe('light'));
    await fireEvent.press(chip('System'));
    await waitFor(() => expect(appScheme()).toBe('system'));
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('system'));
  });

  it('applies the theme from the tap itself, in the same render as the chip', async () => {
    // No AppearanceSync here: the chip and the app theme must not wait for its effect.
    await renderWithQuery(<AppearanceSettings />);
    await waitFor(() => expect(chip('System')).toBeChecked());

    await fireEvent.press(chip('Dark'));

    expect(appScheme()).toBe('dark');
    await waitFor(() => expect(chip('Dark')).toBeChecked());
  });

  it('restores the stored choice on a cold start (new query cache)', async () => {
    const first = await renderWithQuery(<AppearancePage />);
    await waitFor(() => expect(chip('System')).toBeChecked());
    await fireEvent.press(chip('Dark'));
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('dark'));
    await first.unmount();
    const seen: string[] = [];
    function Watch() {
      seen.push(appScheme());
      return null;
    }

    await renderWithQuery(
      <>
        <Watch />
        <AppearancePage />
      </>,
      createTestQueryClient(),
    );

    await waitFor(() => expect(chip('Dark')).toBeChecked());
    expect(appScheme()).toBe('dark');
    // While the stored value loads, the scheme is left as it was (no flash through 'system').
    expect(seen).not.toContain('system');
  });

  it('rolls back and says so when the write fails', async () => {
    const { client } = await renderWithQuery(<AppearancePage />);
    await waitFor(() =>
      expect(client.getQueryData(preferenceQueryKeys.detail('appearance.theme'))).toBe('system'),
    );
    getDb().run(sql`DROP TABLE preferences`);

    await act(async () => {
      fireEvent.press(chip('Dark'));
    });

    expect(await screen.findByText(APPEARANCE_SAVE_ERROR)).toBeVisible();
    expect(chip('System')).toBeChecked();
    expect(appScheme()).toBe('system');
  });
});
