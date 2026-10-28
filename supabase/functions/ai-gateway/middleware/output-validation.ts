// Output schema validation and one repair retry (TB-24, https://stratyge.atlassian.net/browse/TB-24).
// Registered last in ./index.ts, so it is the innermost middleware: request guards (TB-23, TB-25)
// run once, before it, and it wraps only the provider call.
//
//   1. Render the route's versioned prompt (user text inside <user_input>), call the provider.
//   2. Check the answer with the route's Zod schema (packages/schemas/src/ai-output.ts).
//   3. Invalid → one repair call: the same user message plus the validation problems and the
//      rejected answer (prompts/repair.v1.ts). Never a second repair.
//   4. Still invalid → 502 AI_BAD_OUTPUT. The rejected text is dropped: not returned, not logged,
//      not persisted.
//
// Valid output is returned as canonical JSON text in `output` (the parsed, trimmed, defaulted
// value), so clients get exactly what the schema accepted. The gateway itself never writes results
// anywhere; `onValidOutput` is the only place a server-side consumer could attach, and it is
// called with schema-valid output only.
import type { AiRoute } from '../../../../packages/schemas/src/ai-gateway.ts';
import { type AiOutput, checkAiOutput } from '../../../../packages/schemas/src/ai-output.ts';

import { REFERENCE_TIME_ZONE } from '../config.ts';
import { successResponse } from '../gateway.ts';
import { errorResponse } from '../http.ts';
import type { GatewayContext, GatewayMiddleware } from '../pipeline.ts';
import { REPAIR_PROMPT_VERSION, renderRepairMessage } from '../prompts/index.ts';

export type OutputValidationOptions = {
  /** Reference date (`YYYY-MM-DD`) for relative dates. Defaults to today in REFERENCE_TIME_ZONE. */
  referenceDate?: () => string;
  /** Called once per request with validated output only; never on AI_BAD_OUTPUT. */
  onValidOutput?: (ctx: GatewayContext, output: AiOutput<AiRoute>) => void | Promise<void>;
};

/** Today's calendar date in `timeZone`, `YYYY-MM-DD` (en-CA formats dates that way). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The provider stage's answer. A function so TS doesn't keep a narrowing across `await next()`. */
const answerOf = (ctx: GatewayContext) => ctx.result;

export function createOutputValidation(options: OutputValidationOptions = {}): GatewayMiddleware {
  const referenceDate = options.referenceDate ?? (() => todayIn(REFERENCE_TIME_ZONE));

  return {
    name: 'output-validation',
    async handle(ctx, next) {
      const firstMessage = ctx.routeConfig.prompt.renderUser({
        input: ctx.body.input,
        referenceDate: referenceDate(),
      });

      ctx.body = { input: firstMessage };
      let response = await next();
      // Timeouts and provider errors pass through unchanged: there is no answer to validate.
      const firstAnswer = answerOf(ctx);
      if (response.status !== 200 || !firstAnswer) return response;

      const first = checkAiOutput(ctx.route, firstAnswer.text);
      let output: AiOutput<AiRoute>;
      if (first.ok) {
        ctx.outputCheck = { outcome: 'valid' };
        output = first.data;
      } else {
        // Stays `repair_failed` if the repair call itself times out or errors.
        ctx.outputCheck = {
          outcome: 'repair_failed',
          firstIssue: first.kind,
          repairPromptVersion: REPAIR_PROMPT_VERSION,
        };
        ctx.body = {
          input: renderRepairMessage({
            originalMessage: firstMessage,
            previousAnswer: firstAnswer.text,
            issues: first.issues,
          }),
        };
        ctx.result = undefined;
        response = await next();
        const secondAnswer = answerOf(ctx);
        if (response.status !== 200 || !secondAnswer) return response;

        const second = checkAiOutput(ctx.route, secondAnswer.text);
        if (!second.ok) {
          ctx.outputCheck = { ...ctx.outputCheck, outcome: 'invalid', repairIssue: second.kind };
          ctx.result = undefined;
          return errorResponse(ctx.requestId, 'AI_BAD_OUTPUT');
        }
        ctx.outputCheck = { ...ctx.outputCheck, outcome: 'repaired' };
        output = second.data;
      }

      const answer = answerOf(ctx);
      if (!answer) throw new Error('output-validation: no provider answer after a 200');
      // After a repair the client sees the tokens of both calls, as the log line does.
      const usage =
        answer === firstAnswer
          ? answer.usage
          : {
              inputTokens: firstAnswer.usage.inputTokens + answer.usage.inputTokens,
              outputTokens: firstAnswer.usage.outputTokens + answer.usage.outputTokens,
            };
      ctx.result = { ...answer, text: JSON.stringify(output), usage };
      await options.onValidOutput?.(ctx, output);
      return successResponse(ctx);
    },
  };
}

/** The registered instance (no persistence hook: the gateway returns results, it never stores them). */
export const outputValidation = createOutputValidation();
