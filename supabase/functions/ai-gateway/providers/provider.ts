// LLM provider interface (TB-22). The gateway depends only on this, so the vendor can be swapped
// and tests can inject a fake. Implementations must honour `signal` (the 20-second route timeout).

export type ProviderRequest = {
  model: string;
  system: string;
  input: string;
  maxTokens: number;
};

export type ProviderResult = {
  /** Concatenated text blocks of the model's answer. */
  text: string;
  /** Model id the provider reports it used. */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export type AiProvider = {
  readonly name: string;
  complete(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResult>;
};

/** `upstream`: non-2xx or network failure. `bad_response`: 2xx with a body we can't read. */
export type ProviderErrorKind = 'upstream' | 'bad_response';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** Upstream HTTP status when there was one. Safe to log; the body is never kept. */
  readonly status: number | undefined;

  constructor(kind: ProviderErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
  }
}
