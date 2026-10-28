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

import { preferenceQueryKeys } from '../hooks/use-preference';
import { appearanceThemePreference } from '../preferences/appearance';
import { readPreference } from '../repo/preference-repo';
import { APPEARANCE_SAVE_ERROR, AppearanceSettings } from './AppearanceSettings';
import { AppearanceSync } from './AppearanceSync';

let setColorScheme: jest.SpyInstance;

beforeEach(async () => {
  await resetTaskData();
  setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});
afterEach(() => {
  setColorScheme.mockRestore();
  cleanupTaskTests();
});

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

    await waitFor(() => expect(setColorScheme).toHaveBeenCalledWith('auto'));
    expect(chip('System')).toBeChecked();
    expect(chip('Dark')).not.toBeChecked();
  });

  it('applies a choice at once and stores it locally', async () => {
    await renderWithQuery(<AppearancePage />);
    await waitFor(() => expect(setColorScheme).toHaveBeenCalledWith('auto'));

    await fireEvent.press(chip('Dark'));

    expect(chip('Dark')).toBeChecked();
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('dark'));

    await fireEvent.press(chip('Light'));
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    await fireEvent.press(chip('System'));
    expect(setColorScheme).toHaveBeenLastCalledWith('auto');
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('system'));
  });

  it('restores the stored choice on a cold start (new query cache)', async () => {
    const first = await renderWithQuery(<AppearancePage />);
    await waitFor(() => expect(setColorScheme).toHaveBeenCalledWith('auto'));
    await fireEvent.press(chip('Dark'));
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('dark'));
    await first.unmount();
    setColorScheme.mockClear();

    await renderWithQuery(<AppearancePage />, createTestQueryClient());

    await waitFor(() => expect(chip('Dark')).toBeChecked());
    expect(setColorScheme).toHaveBeenCalledWith('dark');
    // The stored value is applied directly: no flash through 'auto' first.
    expect(setColorScheme).not.toHaveBeenCalledWith('auto');
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
    expect(setColorScheme).toHaveBeenLastCalledWith('auto');
  });
});
