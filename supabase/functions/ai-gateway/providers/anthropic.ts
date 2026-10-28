// Anthropic Messages API provider (TB-22). Plain `fetch`, no SDK: small cold start, easy to fake.
// The API key comes from the Edge Function secret ANTHROPIC_API_KEY (read in index.ts, never logged).
import { z } from 'zod';

import { type AiProvider, ProviderError } from './provider.ts';

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_API_VERSION = '2023-06-01';

const messagesResponseSchema = z.object({
  model: z.string(),
  content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'host.docker.internal']);

/**
 * The ANTHROPIC_BASE_URL override, honoured only for a local mock. Any other value is ignored, so a
 * mistaken hosted setting can never send the API key to a third-party host.
 */
export function localProviderBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) ? value : undefined;
  } catch {
    return undefined;
  }
}

export type AnthropicProviderOptions = {
  apiKey: string;
  /** Override for tests and the local mock server; defaults to the public API. */
  baseUrl?: string;
  fetch?: typeof fetch;
};

export function createAnthropicProvider(options: AnthropicProviderOptions): AiProvider {
  const baseUrl = (options.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;

  return {
    name: 'anthropic',
    async complete(request, signal) {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
          },
          body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: 'user', content: request.input }],
          }),
        });
      } catch (error) {
        // An abort must surface as an abort so the gateway can map it to AI_TIMEOUT.
        if (signal.aborted) throw error;
        throw new ProviderError('upstream', 'provider request failed');
      }

      if (!response.ok) {
        // Drain without keeping the body: it can echo the prompt.
        await response.body?.cancel();
        throw new ProviderError('upstream', 'provider returned an error', response.status);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ProviderError('bad_response', 'provider body is not JSON', response.status);
      }
      const parsed = messagesResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new ProviderError('bad_response', 'provider body has an unexpected shape');
      }

      const text = parsed.data.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('');
      return {
        text,
        model: parsed.data.model,
        usage: {
          inputTokens: parsed.data.usage.input_tokens,
          outputTokens: parsed.data.usage.output_tokens,
        },
      };
    },
  };
}
