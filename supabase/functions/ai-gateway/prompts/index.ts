// Current prompt version per route (TB-24, https://stratyge.atlassian.net/browse/TB-24).
// Rolling a prompt forward or back is a one-line change here; the old file stays in the repo.
import type { AiRoute } from '../../../../packages/schemas/src/ai-gateway.ts';

import { breakdownPromptV1 } from './breakdown.v1.ts';
import { parsePromptV1 } from './parse.v1.ts';
import { planPromptV1 } from './plan.v1.ts';
import type { PromptTemplate } from './template.ts';

export { REPAIR_PROMPT_VERSION, renderRepairMessage } from './repair.v1.ts';
export type { PromptTemplate, UserPromptArgs } from './template.ts';

export const PROMPTS: Readonly<Record<AiRoute, PromptTemplate>> = {
  parse: parsePromptV1,
  breakdown: breakdownPromptV1,
  plan: planPromptV1,
};
