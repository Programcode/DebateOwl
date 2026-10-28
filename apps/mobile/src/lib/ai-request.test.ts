import { afterEach, describe, expect, it, vi } from 'vitest';

// A live tool request: the answer streams from the ai function, a refusal
// inside the stream keeps its limit details, and a stream that drops before
// its answer is read back from ai_run_results under the request's own id.

const { fetchMock, runRows } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  /** What each read of ai_run_results returns. */
  runRows: [] as Array<Record<string, unknown> | null>,
}));

vi.mock('expo/fetch', () => ({ fetch: fetchMock }));
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: (runRows.length > 1 ? runRows.shift() : runRows[0]) ?? null, error: null }),
      };
      return chain;
    },
  },
}));

import { AIError, postAI } from './ai-request';

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

function streamed(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const sentBody = () => JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body) as Record<string, unknown>;

afterEach(() => {
  fetchMock.mockReset();
  runRows.length = 0;
});

describe('postAI', () => {
  it('streams the answer, reporting the draft, and parses the result', async () => {
    fetchMock.mockResolvedValue(streamed([
      event('phase', { phase: 'writing' }) + event('delta', { text: '{"thesis":"Free' }),
      event('delta', { text: ' transit"}' }) + event('result', { status: 200, body: { output: { thesis: 'Free transit' } } }),
    ]));
    const phases: string[] = [];
    const answer = await postAI({ feature: 'generate' }, { live: { onDraft: () => {}, onPhase: (phase) => phases.push(phase) } }, ({ output }) => output);
    expect(answer).toEqual({ thesis: 'Free transit' });
    expect(phases).toEqual(['writing']);
    expect(sentBody()).toMatchObject({ feature: 'generate', stream: true, resultKey: expect.stringMatching(/^req_\d+_[a-z0-9]+$/) });
  });

  it('turns a refusal inside the stream into the limit error, with its details', async () => {
    fetchMock.mockResolvedValue(streamed([
      event('result', { status: 402, body: { error: 'Daily limit reached', code: 'limit_reached', limit: 20, current: 20, units: 2 } }),
    ]));
    const error = await postAI({ feature: 'generate' }, { live: { onDraft: () => {} } }, ({ output }) => output).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AIError);
    expect(error).toMatchObject({ kind: 'limitReached', details: { code: 'limit_reached', limit: 20, current: 20, units: 2 } });
  });

  it('reads back the stored answer when the stream ends before its result', async () => {
    // The server stored the answer under the id this request sent.
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const { resultKey } = JSON.parse(init.body) as { resultKey: string };
      runRows.push({ result_key: resultKey, status: 200, body: { output: { thesis: 'Recovered' } } });
      return streamed([event('phase', { phase: 'writing' }) + event('delta', { text: '{"thes' })]);
    });
    const answer = await postAI({ feature: 'attack' }, { live: { onDraft: () => {} } }, ({ output }) => output);
    expect(answer).toEqual({ thesis: 'Recovered' });
  });

  it('fails as a network error when no stored answer belongs to the dropped run', async () => {
    fetchMock.mockResolvedValue(streamed([event('delta', { text: '{' })]));
    runRows.push({ result_key: 'someone-elses-run', status: 200, body: { output: {} } });
    const error = await postAI({ feature: 'factoids' }, { live: { onDraft: () => {} } }, ({ output }) => output).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ kind: 'network' });
  });
});
