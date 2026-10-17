import { describe, expect, it, vi } from 'vitest';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { readLiveResponse } from '@/lib/ai/live';

function eventStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

describe('readLiveResponse', () => {
  it('returns a JSON body as is, for servers that do not stream', async () => {
    const onDraft = vi.fn();
    const body = await readLiveResponse(Response.json({ output: { ok: true } }), { onDraft });
    expect(body).toEqual({ output: { ok: true } });
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('reports phases and the parsed draft, then resolves with the result body', async () => {
    const drafts: unknown[] = [];
    const phases: string[] = [];
    // Each chunk arrives after the draft interval, as model tokens do.
    const chunks = [
      event('phase', { phase: 'research' }) + event('phase', { phase: 'writing' }) + event('delta', { text: '{"thesis": "Free tr' }),
      // An event split across two reads.
      'event: delta\ndata: {"text":"ansit"}',
      '\n\n',
      event('result', { status: 200, body: { output: { thesis: 'Free transit' } } }),
    ];
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 70));
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });

    const body = await readLiveResponse(response, { onDraft: (draft) => drafts.push(draft), onPhase: (phase) => phases.push(phase) });
    expect(body).toEqual({ output: { thesis: 'Free transit' } });
    expect(phases).toEqual(['research', 'writing']);
    expect(drafts).toContainEqual({ thesis: 'Free tr' });
  });

  it('clears the draft when a repair retry starts again', async () => {
    const drafts: unknown[] = [];
    const response = eventStream([
      event('delta', { text: 'not json' }),
      event('reset', {}),
      event('result', { status: 200, body: { output: {} } }),
    ]);
    await readLiveResponse(response, { onDraft: (draft) => drafts.push(draft) });
    expect(drafts).toEqual([{}]);
  });

  it('turns a failed result into the error a plain request gets', async () => {
    const error = await readLiveResponse(eventStream([
      event('result', { status: 402, body: { error: 'Daily limit reached', code: 'limit_reached', limit: 10, current: 10 } }),
    ]), { onDraft: () => {} });
    expect(error).toBeInstanceOf(FunctionsHttpError);
    const context = (error as FunctionsHttpError).context as Response;
    expect(context.status).toBe(402);
    await expect(context.json()).resolves.toMatchObject({ code: 'limit_reached', limit: 10 });
  });

  it('stops reading when the request is aborted, even if the stream keeps going', async () => {
    // A fetch wrapper such as the Jam recorder can leave the body streaming after abort.
    const encoder = new TextEncoder();
    const endless = new Response(new ReadableStream({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.enqueue(encoder.encode(event('delta', { text: 'more ' })));
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const controller = new AbortController();
    const reading = readLiveResponse(endless, { onDraft: () => {} }, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails when the stream ends before its result', async () => {
    const error = await readLiveResponse(eventStream([event('delta', { text: '{"a": "b' })]), { onDraft: () => {} });
    expect(error).toBeInstanceOf(FunctionsFetchError);
  });
});
