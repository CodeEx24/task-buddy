import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { getDb } from '@/db/client';
import {
  cleanupTaskTests,
  createTestQueryClient,
  resetTaskData,
} from '@/features/tasks/testing/task-test-utils';

import { appearanceThemePreference, type AppearanceTheme } from '../preferences/appearance';
import * as repo from '../repo/preference-repo';
import { readPreference } from '../repo/preference-repo';
import { usePreference } from './use-preference';

beforeEach(async () => {
  jest.restoreAllMocks();
  await resetTaskData();
});
afterEach(cleanupTaskTests);

async function renderUsePreference() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = await renderHook(() => usePreference(appearanceThemePreference), { wrapper });
  return { client, ...rendered };
}

describe('usePreference (TB-32)', () => {
  it('a failed earlier write never overwrites a later one that succeeded', async () => {
    const { result, client } = await renderUsePreference();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // First tap (Dark): its write stays pending, then fails after the second tap has been saved.
    let failFirstWrite: (error: Error) => void = () => {};
    const realWrite = jest.requireActual<typeof repo>('../repo/preference-repo').writePreference;
    jest
      .spyOn(repo, 'writePreference')
      .mockImplementationOnce(
        () =>
          new Promise<AppearanceTheme>((_resolve, reject) => {
            failFirstWrite = reject;
          }) as unknown as AppearanceTheme,
      )
      .mockImplementation(realWrite);

    await act(async () => result.current.setValue('dark'));
    // Dark shows while its write is still pending (applies before it is stored). TanStack Query
    // notifies observers in a 0 ms batch that `act` doesn't wait for, so wait for the re-render.
    await waitFor(() => expect(result.current.value).toBe('dark'));
    await act(async () => result.current.setValue('light'));
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('light'));

    await act(async () => failFirstWrite(new Error('disk full')));
    // Let the failed write's error handling (and any re-read) finish before checking.
    await waitFor(() => expect(client.isMutating()).toBe(0));
    await waitFor(() => expect(client.isFetching()).toBe(0));

    expect(result.current.value).toBe('light');
    expect(readPreference(getDb(), appearanceThemePreference)).toBe('light');
    // The error belongs to an older tap; the latest write succeeded.
    expect(result.current.error).toBeNull();
  });

  it('a failed latest write ends on the stored value and reports the error', async () => {
    const { result } = await renderUsePreference();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.setValue('light'));
    await waitFor(() => expect(readPreference(getDb(), appearanceThemePreference)).toBe('light'));

    jest.spyOn(repo, 'writePreference').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await act(async () => result.current.setValue('dark'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.value).toBe('light');
  });
});
