import { useEffect, useState } from 'react';

/** Re-render often enough that "Today" / "Overdue" labels follow the clock. */
export const NOW_REFRESH_MS = 60_000;

/**
 * The current time (epoch ms) for date labels, kept out of render (React components must be
 * pure). Read once on mount, then refreshed every `NOW_REFRESH_MS` (an external clock).
 */
export function useNow(refreshMs: number = NOW_REFRESH_MS): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);
  return now;
}
