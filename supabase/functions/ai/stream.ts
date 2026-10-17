// Live generation for the ai Edge Function. A request that sends
// `stream: true` gets Server-Sent Events instead of one JSON body:
//
//   event: phase   data: {"phase":"research"|"writing"|"checking"}
//   event: delta   data: {"text":"..."}   raw model text, token by token
//   event: reset   data: {}               a repair retry voids the text so far
//   event: result  data: {"status":200,"body":{...}}
//
// `result` comes last, exactly once, and carries the status and JSON body the
// non-streamed request would have answered with. Every check that runs before
// the feature handler still answers with plain JSON and its real status.

import type { GenerationPhase, GenerationStream } from "./provider.ts";

const HEARTBEAT_MS = 15_000;

function sse(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function resultPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text || `Request failed (${response.status})` };
  }
  return { status: response.status, body };
}

/**
 * Runs a feature with a stream sink and returns its events as the response.
 * `cancel` aborts when the browser goes away so provider work stops with it.
 */
export function streamFeatureResponse(
  corsHeaders: Record<string, string>,
  cancel: AbortController,
  run: (stream: GenerationStream) => Promise<Response>,
): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };
      // Research can run for a minute without output; keep proxies from
      // treating the connection as idle.
      heartbeat = setInterval(() => write(": keepalive\n\n"), HEARTBEAT_MS);
      let lastPhase: GenerationPhase | undefined;
      const stream: GenerationStream = {
        delta: (text) => write(sse("delta", { text })),
        reset: () => write(sse("reset", {})),
        phase: (phase) => {
          if (phase === lastPhase) return;
          lastPhase = phase;
          write(sse("phase", { phase }));
        },
      };
      try {
        write(sse("result", await resultPayload(await run(stream))));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        write(sse("result", { status: 500, body: { error: message } }));
      } finally {
        clearInterval(heartbeat);
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      clearInterval(heartbeat);
      cancel.abort();
    },
  });

  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
