import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { CrossfireAIInput, CrossfireDebrief } from '@/lib/crossfire/schemas';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
  settings: {
    customSystemPrompt: undefined as string | undefined,
    outputLanguage: 'en',
  },
  session: {
    sourceLibrary: [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Active source', content: 'Grounded evidence', origin: 'https://example.com', type: 'url', isActive: true },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Inactive source', content: 'Do not send', origin: 'https://inactive.example', type: 'url', isActive: false },
    ],
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  getActiveAccessToken: (): string | null => null,
  invokeAuthenticatedFunction: mocks.invoke,
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: { getState: () => mocks.settings },
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: { getState: () => mocks.session },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { AIResponseError, crossfire, crossfireSignal } from '@/lib/ai/client';

const config: ProviderConfig = {
  provider: 'google',
  model: 'gemini-3-flash-preview',
  temperature: 0.5,
};

function nextTurnInput(useSourceLibrary = false): CrossfireAIInput {
  return {
    operation: 'next-turn',
    config: {
      resolution: 'Resolved: cities should ban private cars downtown.',
      argument: 'Private cars create congestion and unsafe streets.',
      mode: 'question-ai',
      style: 'cooperative',
      durationSeconds: 180,
      useSourceLibrary,
      seedQuestions: [],
    },
    transcript: [{
      id: 'T1',
      sequence: 1,
      speaker: 'user',
      kind: 'question',
      text: 'What evidence supports the congestion claim?',
      createdAt: 1,
    }],
    expectedReply: 'answer',
  };
}

function debriefInput(): CrossfireAIInput {
  const base = nextTurnInput(false);
  if (base.operation !== 'next-turn') throw new Error('Unexpected test fixture');
  return {
    operation: 'debrief',
    config: base.config,
    transcript: [
      ...base.transcript,
      { id: 'T2', sequence: 2, speaker: 'ai', kind: 'answer', text: 'Traffic counts show fewer vehicle trips.', createdAt: 2 },
    ],
  };
}

const validDebrief: CrossfireDebrief = {
  concessionsSecured: [],
  controlledQuestions: [{ turnIds: ['T1', 'T2'], claim: 'The question demands evidence for the central claim.' }],
  weakOrRepetitiveQuestions: [],
  evasiveOrIncompleteAnswers: [],
  missedFollowUps: [{ turnIds: ['T2'], claim: 'The answer does not identify a specific traffic count.' }],
  betterFollowUpQuestions: [{ turnIds: ['T2'], question: 'Which traffic count are you relying on?', reason: 'It tests the answer against a named source.' }],
  strongestExchange: { turnIds: ['T1', 'T2'], claim: 'The exchange focuses on the main empirical warrant.' },
};

describe('Crossfire AI client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.outputLanguage = 'hu';
    mocks.session.sourceLibrary.splice(0, mocks.session.sourceLibrary.length,
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Active source', content: 'Grounded evidence', origin: 'https://example.com', type: 'url', isActive: true },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Inactive source', content: 'Do not send', origin: 'https://inactive.example', type: 'url', isActive: false },
    );
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
  });

  it('omits active sources unless the user enabled Source Library grounding', async () => {
    mocks.invoke.mockResolvedValue({ data: { output: { type: 'answer', text: 'A grounded answer.' } }, error: null });
    await crossfire(nextTurnInput(false), config);
    expect(mocks.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
      body: expect.objectContaining({
        feature: 'crossfire',
        input: expect.objectContaining({ language: 'hu' }),
        sourceIds: [],
        customSystemPrompt: null,
      }),
    }));

    await crossfire(nextTurnInput(true), config);
    const secondCall = mocks.invoke.mock.calls[1][1];
    expect(secondCall.body.sourceIds).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  });

  it('sends only bounded Crossfire source IDs when stored content is large', async () => {
    mocks.session.sourceLibrary.splice(0, mocks.session.sourceLibrary.length,
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        title: `Source ${index}`,
        content: '界'.repeat(9_000),
        origin: `https://example.com/${index}`,
        type: 'text',
        isActive: true,
      })),
    );
    mocks.invoke.mockResolvedValue({ data: { output: { type: 'answer', text: 'A bounded answer.' } }, error: null });

    await crossfire(nextTurnInput(true), config);

    const sourceIds = mocks.invoke.mock.calls[0][1].body.sourceIds as string[];
    expect(sourceIds).toHaveLength(10);
    expect(new TextEncoder().encode(JSON.stringify(mocks.invoke.mock.calls[0][1].body)).byteLength).toBeLessThan(200_000);
  });

  it('rejects malformed and wrong-kind next-turn responses', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { output: { type: 'answer' } }, error: null });
    await expect(crossfire(nextTurnInput(), config)).rejects.toBeInstanceOf(AIResponseError);

    mocks.invoke.mockResolvedValueOnce({ data: { output: { type: 'question', text: 'Wrong role' } }, error: null });
    await expect(crossfire(nextTurnInput(), config)).rejects.toBeInstanceOf(AIResponseError);
  });

  it('parses a valid live signal and rejects unknown or non-answer targets', async () => {
    const signal = { answerTurnId: 'T2', answerQuality: 'direct', answerQualityConfidence: 0.9, concession: 'none', concessionConfidence: 0.8, followUpOpportunity: 0.75 };
    mocks.invoke.mockResolvedValueOnce({ data: { output: { type: 'answer', text: 'Answer.' }, signalToken: 'signed-token' }, error: null });
    await expect(crossfire(nextTurnInput(), config)).resolves.toEqual({ type: 'answer', text: 'Answer.', signalToken: 'signed-token' });

    const next = nextTurnInput();
    if (next.operation !== 'next-turn') throw new Error('Unexpected fixture');
    const signalInput = { config: next.config, transcript: next.transcript, reply: { type: 'answer' as const, text: 'Answer.' }, signalToken: 'signed-token' };
    mocks.invoke.mockResolvedValueOnce({ data: { output: { signal } }, error: null });
    await expect(crossfireSignal(signalInput, config)).resolves.toEqual(signal);

    mocks.invoke.mockResolvedValueOnce({ data: { output: { signal: { ...signal, answerTurnId: 'T99' } } }, error: null });
    await expect(crossfireSignal(signalInput, config)).rejects.toBeInstanceOf(AIResponseError);

    mocks.invoke.mockResolvedValueOnce({ data: { output: { signal: { ...signal, answerTurnId: 'T1' } } }, error: null });
    await expect(crossfireSignal(signalInput, config)).rejects.toBeInstanceOf(AIResponseError);
  });

  it('validates debrief shape and every transcript reference', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { output: validDebrief }, error: null });
    await expect(crossfire(debriefInput(), config)).resolves.toEqual(validDebrief);

    mocks.invoke.mockResolvedValueOnce({
      data: { output: { ...validDebrief, strongestExchange: { turnIds: ['T999'], claim: 'Invented reference' } } },
      error: null,
    });
    await expect(crossfire(debriefInput(), config)).rejects.toMatchObject({
      name: 'AIResponseError',
      message: expect.stringContaining('referenced transcript turns'),
    });
  });

  it('rejects invalid requests before invoking the edge function', async () => {
    const invalid = nextTurnInput() as CrossfireAIInput;
    invalid.config.argument = '';
    await expect(crossfire(invalid, config)).rejects.toBeInstanceOf(AIResponseError);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('aborts while session resolution is pending without invoking the edge function', async () => {
    mocks.getSession.mockImplementationOnce(() => new Promise(() => undefined));
    const controller = new AbortController();
    const request = crossfire(nextTurnInput(), config, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('cancels an oversized Function error stream before buffering the full body', async () => {
    let pulls = 0;
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1_024).fill(120));
        if (pulls >= 40) controller.close();
      },
      cancel() {
        canceled = true;
      },
    });
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 500 Internal',
        context: { body: stream, status: 500 },
      },
    });

    await expect(crossfire(nextTurnInput(), config)).rejects.toMatchObject({ name: 'AIError' });
    expect(canceled).toBe(true);
    expect(pulls).toBeLessThan(40);
  });
});
