import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectiveWithoutDb } from '../src/lib/settings';
import { chatCompletion } from '../src/lib/ai/openrouter';

const savedModel = process.env.OPENROUTER_MODEL;
const savedCheap = process.env.OPENROUTER_CHEAP_MODEL;
const savedKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  delete process.env.OPENROUTER_MODEL;
  delete process.env.OPENROUTER_CHEAP_MODEL;
  process.env.OPENROUTER_API_KEY = 'test-key';
});

afterEach(() => {
  if (savedModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = savedModel;
  if (savedCheap === undefined) delete process.env.OPENROUTER_CHEAP_MODEL;
  else process.env.OPENROUTER_CHEAP_MODEL = savedCheap;
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
  vi.unstubAllGlobals();
});

function okJson(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  };
}

function errJson(status: number, body = "") {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

describe('openrouter free-tier defaults', () => {
  it('primary and cheap default to :free models (never a paid default)', () => {
    expect(effectiveWithoutDb('openrouter.model')).toMatch(/:free$/);
    expect(effectiveWithoutDb('openrouter.cheap_model')).toMatch(/:free$/);
  });
});

describe('chatCompletion retry', () => {
  it('retries 429 then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errJson(429, "rate limited"))
      .mockResolvedValueOnce(okJson("recovered"));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatCompletion(
      [{ role: 'user', content: 'hi' }],
      { modelOverride: 'thinkingmachines/inkling:free' }
    );
    expect(res.text).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on 401 without retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errJson(401, 'bad key'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      chatCompletion([{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('OpenRouter 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 404 only when the body says no provider', async () => {
    const noProvider = vi.fn()
      .mockResolvedValueOnce(errJson(404, 'No provider can serve the request'))
      .mockResolvedValueOnce(okJson('recovered'));
    vi.stubGlobal('fetch', noProvider);
    const res = await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('recovered');
    expect(noProvider).toHaveBeenCalledTimes(2);

    const unknownModel = vi.fn().mockResolvedValueOnce(errJson(404, 'unknown model'));
    vi.stubGlobal('fetch', unknownModel);
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenRouter 404'
    );
    expect(unknownModel).toHaveBeenCalledTimes(1);
  });
});
