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
