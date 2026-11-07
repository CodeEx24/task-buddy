// TB-22: Anthropic provider request shape and response/error mapping, with a stubbed fetch.
import {
  ANTHROPIC_API_VERSION,
  createAnthropicProvider,
  localProviderBaseUrl,
} from './anthropic.ts';
import { ProviderError } from './provider.ts';

const REQUEST = { model: 'claude-haiku-5-5', system: 'sys', input: 'buy milk', maxTokens: 64 };
// Built at runtime so no key-shaped literal sits in the repo.
const API_KEY = ['test', 'key', String(Date.now())].join('-');

function stubFetch(response: Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { fetchStub, calls };
}

const okBody = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [
    { type: 'text', text: '{"tasks":' },
    { type: 'tool_use', id: 't', name: 'x', input: {} },
    { type: 'text', text: '[]}' },
  ],
  stop_reason: 'end_turn',
  usage: { input_tokens: 12, output_tokens: 7 },
};

describe('createAnthropicProvider', () => {
  it('posts a Messages API request with the key header, model and signal', async () => {
    const { fetchStub, calls } = stubFetch(Response.json(okBody));
    const provider = createAnthropicProvider({
      apiKey: API_KEY,
      baseUrl: 'http://mock:8787/',
      fetch: fetchStub,
    });
    const signal = new AbortController().signal;
    const result = await provider.complete(REQUEST, signal);

    expect(result).toEqual({
      text: '{"tasks":[]}',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 12, outputTokens: 7 },
    });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('http://mock:8787/v1/messages');
    expect(call.init.signal).toBe(signal);
    expect(call.init.headers).toMatchObject({
      'x-api-key': API_KEY,
      'anthropic-version': ANTHROPIC_API_VERSION,
    });
    expect(JSON.parse(String(call.init.body))).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 64,
      system: 'sys',
      messages: [{ role: 'user', content: 'buy milk' }],
    });
  });

  it('defaults to the public API base URL', async () => {
    const { fetchStub, calls } = stubFetch(Response.json(okBody));
    await createAnthropicProvider({ apiKey: API_KEY, fetch: fetchStub }).complete(
      REQUEST,
      new AbortController().signal,
    );
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('maps a non-2xx answer to ProviderError(upstream) without keeping the body', async () => {
    const { fetchStub } = stubFetch(
      new Response('{"error":{"message":"echo of buy milk"}}', { status: 529 }),
    );
    const provider = createAnthropicProvider({ apiKey: API_KEY, fetch: fetchStub });
    const error = await provider.complete(REQUEST, new AbortController().signal).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: 'upstream', status: 529 });
    expect(String(error.message)).not.toContain('buy milk');
  });

  it('maps a network failure to ProviderError(upstream)', async () => {
    const { fetchStub } = stubFetch(new TypeError('fetch failed'));
    const provider = createAnthropicProvider({ apiKey: API_KEY, fetch: fetchStub });
    await expect(provider.complete(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      kind: 'upstream',
    });
  });

  it('rethrows the abort when the signal fired, so the gateway reports a timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const { fetchStub } = stubFetch(abort);
    const provider = createAnthropicProvider({ apiKey: API_KEY, fetch: fetchStub });
    await expect(provider.complete(REQUEST, controller.signal)).rejects.toBe(abort);
  });

  it.each([
    ['not JSON', new Response('<html>', { status: 200 })],
    ['wrong shape', Response.json({ content: 'x' })],
  ])('maps a 2xx with %s to ProviderError(bad_response)', async (_label, response) => {
    const { fetchStub } = stubFetch(response);
    const provider = createAnthropicProvider({ apiKey: API_KEY, fetch: fetchStub });
    await expect(provider.complete(REQUEST, new AbortController().signal)).rejects.toMatchObject({
      kind: 'bad_response',
    });
  });
});

describe('localProviderBaseUrl', () => {
  it.each([
    ['http://host.docker.internal:8787', 'http://host.docker.internal:8787'],
    ['http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
    ['http://localhost:8787/', 'http://localhost:8787/'],
    ['https://evil.example.com', undefined],
    ['http://localhost.evil.example.com', undefined],
    ['https://api.anthropic.com', undefined],
    ['not a url', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('%p → %p', (value, expected) => {
    expect(localProviderBaseUrl(value)).toBe(expected);
  });
});
