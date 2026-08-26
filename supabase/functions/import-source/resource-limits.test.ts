import { describe, expect, it } from 'vitest';
import { readBoundedText } from './resource-limits.ts';

describe('source-import resource limits', () => {
  it('reads a normal text response', async () => {
    const response = new Response('Debate evidence source text.');
    await expect(readBoundedText(response, 1024, 100)).resolves.toBe('Debate evidence source text.');
  });

  it('rejects an oversized declared content length before reading', async () => {
    const response = new Response('small', { headers: { 'content-length': '2048' } });
    await expect(readBoundedText(response, 1024, 100)).rejects.toThrow(/exceeds the 1 MB import limit/i);
  });

  it('rejects a streamed body once the byte cap is exceeded', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    const response = new Response(stream);
    await expect(readBoundedText(response, 10, 100)).rejects.toThrow(/exceeds the 1 MB import limit/i);
  });

  it('aborts body consumption when the read deadline expires', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('headers arrived but body never finishes'));
      },
    });
    const response = new Response(stream);
    await expect(readBoundedText(response, 1024, 5)).rejects.toThrow(/body timed out/i);
  });
});
