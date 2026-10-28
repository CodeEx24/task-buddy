import { useCallback, useEffect, useRef } from 'react';

/** Autosave fires this long after the last change (TB-28 AC: within 500 ms of the last keystroke). */
export const AUTOSAVE_DELAY_MS = 500;

export type Autosave = {
  /** Saves a pending change now instead of waiting for the delay. Resolves when it is saved. */
  flush: () => Promise<void>;
};

/**
 * Debounced autosave. `pending` is what still needs saving (null = nothing, or not valid yet).
 * Every new value restarts the timer, so `save` runs `delayMs` after the last change. A change that
 * is still waiting when the component unmounts (the screen closes) is saved right away, so nothing
 * typed is lost. Values are compared by their JSON, so a new object with the same content does not
 * restart the timer.
 */
export function useAutosave<T>(
  pending: T | null,
  save: (value: T) => Promise<unknown> | void,
  delayMs: number = AUTOSAVE_DELAY_MS,
): Autosave {
  const latest = useRef({ pending, save });
  // A change that was handed to `save` is not pending any more, even before the next render.
  const savedKey = useRef<string | null>(null);
  const key = pending === null ? null : JSON.stringify(pending);

  useEffect(() => {
    latest.current = { pending, save };
  });

  const flush = useCallback(async () => {
    const { pending: value, save: run } = latest.current;
    if (value === null) return;
    const valueKey = JSON.stringify(value);
    if (savedKey.current === valueKey) return;
    savedKey.current = valueKey;
    try {
      await run(value);
    } catch {
      // `save` reports its own failures; a failed value is retried only once it changes again.
    }
  }, []);

  useEffect(() => {
    if (key === null) {
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
