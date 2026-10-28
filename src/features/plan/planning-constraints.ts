// The planner's view of the user's day (TB-33): work hours and daily capacity, read from the
// local `planner.constraints` preference. Users who never opened the Work hours page get the
// defaults (09:00–17:00, 6 h). TB-34 (AI daily plan) consumes this; the gateway request can carry
// it as-is because the shape is `planningConstraintsSchema` from `packages/schemas`.
import type { TaskBuddyDb } from '@/db/types';
import { planningConstraintsPreference } from '@/features/settings/preferences/planning';
import { readPreference } from '@/features/settings/repo/preference-repo';

export {
  DEFAULT_PLANNING_CONSTRAINTS,
  planningConstraintsSchema,
  type PlanningConstraints,
  type WorkHours,
} from '../../../packages/schemas/src/planning';

/** The stored work hours and capacity, or the defaults when nothing valid is stored. */
export function getPlanningConstraints(db: TaskBuddyDb) {
  return readPreference(db, planningConstraintsPreference);
}
