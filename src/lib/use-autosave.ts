import { useCallback, useEffect, useRef } from 'react';

/** Autosave fires this long after the last change (TB-28 AC: within 500 ms of the last keystroke). */
export const AUTOSAVE_DELAY_MS = 500;

export type Autosave = {
  /** Saves a pending change now instead of waiting for the delay. Resolves when it is settled. */
  flush: () => Promise<void>;
};

/**
 * Debounced autosave. `pending` is what still needs saving (null = nothing, or not valid yet).
 * Every new value restarts the timer, so `save` runs `delayMs` after the last change. A change that
 * is still waiting when the component unmounts (the screen closes) is saved right away, so nothing
 * typed is lost. Values are compared by their JSON, so a new object with the same content does not
 * restart the timer.
 *
 * A value whose save failed is never retried on its own: an optimistic update followed by a
 * rollback makes it pending again, and retrying would loop every `delayMs`. It is attempted again
 * only after a different value was attempted (the user edited again).
 */
export function useAutosave<T>(
  pending: T | null,
  save: (value: T) => Promise<unknown> | void,
  delayMs: number = AUTOSAVE_DELAY_MS,
): Autosave {
  const latest = useRef({ pending, save });
  /** The value being written right now (no duplicate write while it is in flight). */
  const inFlightKey = useRef<string | null>(null);
  /** The last value saved; not saved again while it stays pending (cleared once nothing is). */
  const savedKey = useRef<string | null>(null);
  /** The last value whose save failed; blocked until another value is attempted. */
  const failedKey = useRef<string | null>(null);
  const key = pending === null ? null : JSON.stringify(pending);

  useEffect(() => {
    latest.current = { pending, save };
  });

  const flush = useCallback(async () => {
    const { pending: value, save: run } = latest.current;
    if (value === null) return;
    const valueKey = JSON.stringify(value);
    if ([inFlightKey.current, savedKey.current, failedKey.current].includes(valueKey)) return;
    inFlightKey.current = valueKey;
    failedKey.current = null;
    try {
      await run(value);
      // Usually the saved value stopped being pending already (optimistic update). Only remember
      // it while it is still pending, so editing back to it later saves again.
      const now = latest.current.pending;
      if (now !== null && JSON.stringify(now) === valueKey) savedKey.current = valueKey;
    } catch {
      // `save` reports its own failure; this value now waits for the next edit.
      failedKey.current = valueKey;
    } finally {
      if (inFlightKey.current === valueKey) inFlightKey.current = null;
    }
  }, []);

  useEffect(() => {
    if (key === null) {
      // Saved and stored. A later identical value is a new change (edited back) and is saved.
      // The failed-value block is deliberately kept: a rollback makes a failed value pending again.
      savedKey.current = null;
      return;
    }
    const id = setTimeout(() => void flush(), delayMs);
    return () => clearTimeout(id);
  }, [key, delayMs, flush]);

  // Closing the screen saves what is still waiting.
  useEffect(() => () => void flush(), [flush]);

  return { flush };
}
