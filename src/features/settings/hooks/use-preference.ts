// Read and change one preference (TB-32). The cached value changes first, so every screen that
// reads the preference re-renders at once ("applies immediately"); the repository then writes it
// to SQLite. A failed write is reported through `error` and the value is re-read from SQLite, so
// it always ends on what is actually stored, even when a later write already succeeded.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { getDb } from '@/db/client';

import type { PreferenceDefinition } from '../preferences/define-preference';
import { readPreference, writePreference } from '../repo/preference-repo';

export const preferenceQueryKeys = {
  all: ['preferences'] as const,
  detail: (key: string) => ['preferences', key] as const,
};

export type UsePreferenceResult<T> = {
  /** The stored value; the default while loading or when nothing valid is stored. */
  value: T;
  isLoading: boolean;
  setValue: (value: T) => void;
  /** The latest write's error, if it failed (the value is then re-read from SQLite). */
  error: Error | null;
};

export function usePreference<T>(definition: PreferenceDefinition<T>): UsePreferenceResult<T> {
  const client = useQueryClient();
  const key = preferenceQueryKeys.detail(definition.key);

  const query = useQuery<T>({
    queryKey: key,
    queryFn: () => readPreference(getDb(), definition),
  });

  // Each tap gets a number; only the latest tap may put its "previous" value back.
  const latestWrite = useRef(0);

  const mutation = useMutation<T, Error, { value: T; previous: T | undefined; write: number }>({
    mutationFn: async ({ value }) => writePreference(getDb(), definition, value),
    onError: async (_error, { previous, write }) => {
      // Undo the optimistic value at once unless a newer tap has replaced it, then re-read the
      // stored value: a failed earlier tap never overwrites a later one that succeeded.
      if (write === latestWrite.current) {
        client.setQueryData<T>(key, previous === undefined ? definition.defaultValue : previous);
      }
      await client.invalidateQueries({ queryKey: key });
    },
    onSuccess: (stored, { write }) => {
      if (write === latestWrite.current) client.setQueryData<T>(key, stored);
    },
  });

  // The cache changes synchronously, before the write is scheduled, so the new value is on screen
  // in the same render pass as the tap. An initial read still in flight must not overwrite it.
  const setValue = (value: T) => {
    void client.cancelQueries({ queryKey: key });
    const previous = client.getQueryData<T>(key);
    client.setQueryData<T>(key, value);
    latestWrite.current += 1;
    mutation.mutate({ value, previous, write: latestWrite.current });
  };

  return {
    value: query.data === undefined ? definition.defaultValue : query.data,
    isLoading: query.isPending,
    setValue,
    error: mutation.error,
  };
}
