import { usePreference } from '@/features/settings/hooks/use-preference';
import { planningConstraintsPreference } from '@/features/settings/preferences/planning';

import type { PlanningConstraints } from '../planning-constraints';

/**
 * Work hours and daily capacity for UI that plans the day (TB-33). Shares the query cache with
 * the Work hours settings page, so a saved change reaches every reader at once. Defaults while
 * loading or when nothing is stored.
 */
export function usePlanningConstraints(): PlanningConstraints {
  return usePreference(planningConstraintsPreference).value;
}
