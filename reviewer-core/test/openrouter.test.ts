import { afterEach, describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/index.js';

/**
 * Hermetic tests for the OpenRouter adapter: the parse-with-repair loop and the
 * `/models` payload validation. No network: the OpenAI SDK call is replaced on
 * the provider's client, and `fetch` is stubbed for `/models`.
 */

const Schema = z.object({ answer: z.number() });

type CreateFn = (body: Record<string, unknown>) => Promise<unknown>;

function providerWith(responses: unknown[]) {
  const provider = new OpenRouterProvider('test-key', { maxRetries: 0 });
  const bodies: Record<string, unknown>[] = [];
  const create = vi.fn<CreateFn>(async (body) => {
    // snapshot: the provider mutates its messages array between attempts
    bodies.push({ ...body, messages: [...(body.messages as unknown[])] });
    const next = responses.shift();
    if (next === undefined) throw new Error('no more stubbed responses');
    return next;
  });
  // The SDK client is the adapter's IO edge; replace its single call site.
  (provider as unknown as { client: { chat: { completions: { create: CreateFn } } } }).client = {
    chat: { completions: { create } },
  };
  return { provider, create, bodies };
}

const reply = (content: string, usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({
  choices: [{ message: { content } }],
  usage,
});

const req = (maxRetries = 2) => ({
  model: 'm',
  schema: Schema,
  schemaName: 'Answer',
  messages: [{ role: 'user' as const, content: 'q' }],
  maxRetries,
  maxTokens: 1234,
});

describe('OpenRouterProvider.completeStructured — repair loop', () => {
  it('repairs invalid JSON on the second attempt and sums usage', async () => {
    const { provider, bodies } = providerWith([reply('not json'), reply('{"answer": 42}')]);
    const res = await provider.completeStructured(req());

    expect(res.data).toEqual({ answer: 42 });
    expect(res.attempts).toBe(2);
    expect(res.tokensIn).toBe(20);
    expect(res.tokensOut).toBe(10);
    // second call carries the bad output + a repair instruction
    const msgs = bodies[1]!.messages as { role: string; content: string }[];
    expect(msgs).toHaveLength(3);
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'not json' });
    expect(msgs[2]!.role).toBe('user');
    expect(msgs[2]!.content).toMatch(/not valid JSON/);
    // the output cap is forwarded
    expect(bodies[0]!.max_tokens).toBe(1234);
  });

  it('throws with the last schema issues when every attempt is invalid', async () => {
    const { provider, create } = providerWith([
      reply('{"answer": "x"}'),
      reply('{"answer": "y"}'),
      reply('{"wrong": 1}'),
    ]);
    await expect(provider.completeStructured(req(2))).rejects.toThrow(
      /failed schema validation for Answer: .*answer: Required/,
    );
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('surfaces an HTTP-200 response with no choices', async () => {
    const { provider } = providerWith([{ choices: [], error: { message: 'upstream rate limit' } }]);
    await expect(provider.completeStructured(req())).rejects.toThrow(
      /no choices for Answer: upstream rate limit/,
    );
  });
});

describe('OpenRouterProvider.listModels — payload validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (body: unknown, ok = true, status = 200) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, status, json: async () => body })),
    );

  it('maps a valid payload, converts prices per 1M, sorts cheapest first, unknown price last', async () => {
    stubFetch({
      data: [
        { id: 'pricey', name: 'Pricey', context_length: 8000, pricing: { prompt: '0.00001', completion: '0.00003' } },
        { id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' }, extra: true },
        { id: 'cheap', pricing: { prompt: '0.0000001', completion: '0.0000002' } },
      ],
    });
    const models = await new OpenRouterProvider('k').listModels();
    expect(models.map((m) => m.id)).toEqual(['cheap', 'pricey', 'openrouter/auto']);
    expect(models[1]).toMatchObject({ label: 'Pricey', contextLength: 8000, provider: 'openrouter' });
    expect(models[1]!.pricing!.completionPerM).toBeCloseTo(30);
    expect(models[2]!.pricing).toBeNull();
  });

  it.each([
    { name: 'missing data', body: { models: [] } },
    { name: 'id not a string', body: { data: [{ id: 42 }] } },
    { name: 'data not an array', body: { data: 'nope' } },
  ])('throws a descriptive error on a malformed payload ($name)', async ({ body }) => {
    stubFetch(body);
    await expect(new OpenRouterProvider('k').listModels()).rejects.toThrow(
      /\/models returned an unexpected shape: /,
    );
  });

  it('throws on a non-2xx status', async () => {
    stubFetch({}, false, 503);
    await expect(new OpenRouterProvider('k').listModels()).rejects.toThrow('/models returned 503');
  });
});
