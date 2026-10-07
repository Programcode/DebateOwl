import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { BodyTooLargeError, readBoundedBody } from "./bounded-body.ts";

// A streamed body with no Content-Length, sent in 1000-byte chunks.
function streamOf(bytes: number, headers: HeadersInit = {}) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const size = Math.min(1000, bytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return new Response(body, { headers });
}

Deno.test("readBoundedBody accepts a body of exactly the cap and rejects one byte more", async () => {
  assertEquals((await readBoundedBody(streamOf(4096), 4096)).length, 4096);
  await assertRejects(() => readBoundedBody(streamOf(4097), 4096), BodyTooLargeError);
});

Deno.test("readBoundedBody counts bytes received, not the declared Content-Length", async () => {
  await assertRejects(() => readBoundedBody(streamOf(8000, { "content-length": "10" }), 4096), BodyTooLargeError);
  await assertRejects(() => readBoundedBody(new Response("tiny", { headers: { "content-length": "4097" } }), 4096), BodyTooLargeError);
});

// The hosted runtime holds a response until the request body has been read, so
// an oversized request must be drained, while an upstream response is cancelled.
function trackedStream(bytes: number) {
  const state = { sent: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.sent >= bytes) return controller.close();
      const size = Math.min(1000, bytes - state.sent);
      state.sent += size;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { body, state };
}

Deno.test("readBoundedBody reads an oversized request to the end before refusing it", async () => {
  for (const contentLength of [undefined, "20000"]) {
    const { body, state } = trackedStream(20_000);
    const headers: HeadersInit = contentLength ? { "content-length": contentLength } : {};
    const request = new Request("http://127.0.0.1/", { method: "POST", body, headers, duplex: "half" } as RequestInit);
    await assertRejects(() => readBoundedBody(request, 4096), BodyTooLargeError);
    assertEquals(state, { sent: 20_000, cancelled: false }, `content-length ${contentLength}`);
  }
});

Deno.test("readBoundedBody cancels an oversized upstream response instead of reading it", async () => {
  const { body, state } = trackedStream(20_000);
  await assertRejects(() => readBoundedBody(new Response(body), 4096), BodyTooLargeError);
  assertEquals(state.cancelled, true);
  if (state.sent >= 20_000) throw new Error("the whole response was read");
});
