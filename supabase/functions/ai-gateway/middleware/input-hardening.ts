// Prompt-injection and input hardening (TB-25, https://stratyge.atlassian.net/browse/TB-25).
// Registered FIRST in ./index.ts, so it is the outermost middleware:
//
//   before next(): sanitise the user's text (packages/schemas/src/ai-input.ts: control, zero-width
//                  and bidi characters stripped, NFKC) and enforce 2,000 code points; turn our
//                  delimiter tags (<user_input>, TB-24) in it into [user_input]:
//                  over → 413 INPUT_TOO_LONG, nothing left → 400 BAD_REQUEST. Both happen before
//                  the TB-23 quota is consumed and before the provider is called.
//                  Then append HARDENING_RULES and a fresh random canary to the system prompt.
//   after next():  a 200 whose answer contains the canary (also reversed) or 8 verbatim words of
//                  the system prompt, plain or in ROT13, Base64 or hex → 502 AI_UNSAFE_OUTPUT. The
//                  answer is dropped: not returned, not logged. TB-23 has already ledgered the call
//                  (it was billed).
//
// The gateway sends no tools to the model and has no action path: answers are text the app must
// show the user for confirmation (see docs/tickets/TB-25/spec.md, AC1 and AC3).
import { checkAiInput } from '../../../../packages/schemas/src/ai-input.ts';

import { errorResponse } from '../http.ts';
import type { GatewayMiddleware } from '../pipeline.ts';
import {
  detectPromptLeak,
  hardenSystemPrompt,
  neutralizeDelimiterTags,
  newCanary,
} from '../prompt-guard.ts';

export type InputHardeningOptions = {
  /** Canary generator; tests inject a fixed one. */
  newCanary?: () => string;
};

/**
 * The `output` field of a 200 body, or '' when it can't be read. Reads a clone, so the original
 * body is still there to return; on the gateway it equals `ctx.result.text`, but TB-24 rewrites it
 * as canonical JSON, so both are checked.
 */
async function outputOf(response: Response): Promise<string> {
  try {
    const body: unknown = await response.clone().json();
    const output =
      typeof body === 'object' && body !== null ? (body as { output?: unknown }).output : undefined;
    return typeof output === 'string' ? output : '';
  } catch {
    return '';
  }
}

export function createInputHardening(options: InputHardeningOptions = {}): GatewayMiddleware {
  const makeCanary = options.newCanary ?? newCanary;

  return {
    name: 'input-hardening',
    async handle(ctx, next) {
      const check = checkAiInput(ctx.body.input);
      if (!check.ok) {
        return errorResponse(
          ctx.requestId,
          check.reason === 'too_long' ? 'INPUT_TOO_LONG' : 'BAD_REQUEST',
        );
      }
      const userText = neutralizeDelimiterTags(check.text);
      ctx.body = { ...ctx.body, input: userText };

      const canary = makeCanary();
      const system = hardenSystemPrompt(ctx.routeConfig.system, canary);
      ctx.routeConfig = { ...ctx.routeConfig, system };

      const response = await next();
      if (response.status !== 200) return response;

      // The raw answer (before any TB-24 canonicalisation) and what the client would receive.
      const answers = [ctx.result?.text ?? '', await outputOf(response)];
      if (answers.some((answer) => detectPromptLeak(answer, system, canary, userText) !== null)) {
        await response.body?.cancel();
        return errorResponse(ctx.requestId, 'AI_UNSAFE_OUTPUT');
      }
      return response;
    },
  };
}
