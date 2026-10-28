import {
  DEFAULT_PLANNING_CONSTRAINTS,
  planningConstraintsSchema,
  type PlanningConstraints,
} from '../../../../packages/schemas/src/planning';
import { definePreference } from './define-preference';

/**
 * Work hours and daily capacity (TB-33), stored as one value so "capacity fits in the work hours"
 * is checked on every write and read. Default 09:00–17:00, 6 h. The planner reads it through
 * `src/features/plan` (`getPlanningConstraints` / `usePlanningConstraints`).
 */
export const planningConstraintsPreference = definePreference<PlanningConstraints>({
  key: 'planner.constraints',
  schema: planningConstraintsSchema,
  defaultValue: DEFAULT_PLANNING_CONSTRAINTS,
});
