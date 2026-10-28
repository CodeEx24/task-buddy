// The preference registry (TB-32): every preference the app stores, declared once with its key,
// Zod schema and default. Add a new preference here (one file per area, e.g. `work-hours.ts` in
// TB-33); the repository and `usePreference` work for it with no other change.
import { appearanceThemePreference } from './appearance';
import type { PreferenceDefinition } from './define-preference';

export { APPEARANCE_THEMES, appearanceThemePreference, type AppearanceTheme } from './appearance';
export {
  decodePreference,
  definePreference,
  encodePreference,
  type PreferenceDefinition,
} from './define-preference';

/** Every registered preference. Keys must be unique (checked by the registry test). */
export const PREFERENCES: readonly PreferenceDefinition<unknown>[] = [appearanceThemePreference];
