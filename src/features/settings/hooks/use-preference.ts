// Read and change one preference (TB-32). The cached value changes first, so every screen that
// reads the preference re-renders at once ("applies immediately"); the repository then writes it
// to SQLite. A failed write rolls the cache back and is reported through `error`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  /** The last failed write, if any (the value has already been rolled back). */
  error: Error | null;
};

export function usePreference<T>(definition: PreferenceDefinition<T>): UsePreferenceResult<T> {
  const client = useQueryClient();
  const key = preferenceQueryKeys.detail(definition.key);

  const query = useQuery<T>({
    queryKey: key,
    queryFn: () => readPreference(getDb(), definition),
  });

  const mutation = useMutation<T, Error, { value: T; previous: T | undefined }>({
    mutationFn: async ({ value }) => writePreference(getDb(), definition, value),
    onError: (_error, { previous }) => {
      client.setQueryData<T>(key, previous === undefined ? definition.defaultValue : previous);
    },
    onSuccess: (stored) => {
      client.setQueryData<T>(key, stored);
    },
  });

  // The cache changes synchronously, before the write is scheduled, so the new value is on screen
  // in the same render pass as the tap. An initial read still in flight must not overwrite it.
  const setValue = (value: T) => {
    void client.cancelQueries({ queryKey: key });
    const previous = client.getQueryData<T>(key);
    client.setQueryData<T>(key, value);
    mutation.mutate({ value, previous });
  };

  return {
    value: query.data === undefined ? definition.defaultValue : query.data,
    isLoading: query.isPending,
    setValue,
    error: mutation.error,
  };
}
