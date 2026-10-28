import type { TaskBuddyDb } from '@/db/types';
import { setColorSchemePreference } from '@/theme';

import { appearanceThemePreference } from './preferences/appearance';
import { readPreference } from './repo/preference-repo';

/**
 * Applies the stored theme synchronously at start-up (TB-32). Passed to `DbGate` as `onReady`, so
 * it runs right after the migrations and before the first screen renders: a Dark user on a light
 * device never sees a light frame. Never throws: on a DB failure the system scheme stays.
 */
export function applyStoredAppearance(db: TaskBuddyDb): void {
  try {
    setColorSchemePreference(readPreference(db, appearanceThemePreference));
  } catch {
    // Unreadable preference: keep the system scheme; AppearanceSync retries via the query.
  }
}
