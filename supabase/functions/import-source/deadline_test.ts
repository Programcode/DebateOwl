import { FakeTime } from "jsr:@std/testing@1.0.17/time";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest, sourceTransport } = await import("./index.ts");

// These tests stub the source with globalThis.fetch. Route the pinned transport
// there, recording the addresses each hop was allowed to dial.
const dialedAddresses: string[][] = [];
sourceTransport.get = (url, addresses, headers, signal) => {
  dialedAddresses.push(addresses);
  return fetch(url, { headers, signal, redirect: "manual" });
};

// A body that sends one small chunk every 500 ms forever, or never sends at all.
function slowBody(mode: "drip" | "stall", onCancel: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (mode === "stall") return new Promise<void>(() => {});
      return new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode("<p>slow words arriving </p>"));
          resolve();
        }, 500);
      });
    },
    cancel() {
      clearTimeout(timer);
      onCancel();
    },
  });
}

async function importAgainstSlowServer(mode: "drip" | "stall") {
  const time = new FakeTime();
  const originalFetch = globalThis.fetch;
  const originalResolveDns = Deno.resolveDns;
  let bodyCancelled = false;

  (Deno as unknown as { resolveDns: unknown }).resolveDns = (_host: string, type: string) => Promise.resolve(type === "A" ? ["93.184.216.34"] : []);
  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://slow.example") {
      return new Response(slowBody(mode, () => (bodyCancelled = true)), { headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", aud: "authenticated" });
    if (url.pathname.includes("/rest/v1/user_roles")) return Response.json({ role: "user" });
    if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) return Response.json([{ allowed: true, current_count: 1 }]);
    if (url.pathname.includes("/rest/v1/rpc/refund_daily_quota")) return Response.json(0);
    if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    let settled: Response | undefined;
    const pending = handleRequest(
      new Request("http://127.0.0.1/functions/v1/import-source", {
        method: "POST",
        headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://slow.example/article" }),
      }),
    ).then((response) => (settled = response));

    // Past the 10 s deadline, plus a margin, in 250 ms steps so drips interleave.
    for (let elapsed = 0; elapsed < 11_000 && !settled; elapsed += 250) {
      await time.tickAsync(250);
    }
    if (!settled) throw new Error(`import-source was still reading the ${mode} body after 11 s`);
    await pending;

    const body = await settled.json();
    if (settled.status !== 504) throw new Error(`expected 504, got ${settled.status}: ${JSON.stringify(body)}`);
    if (!bodyCancelled) throw new Error("the upstream body was not cancelled at the deadline");
  } finally {
    globalThis.fetch = originalFetch;
      (Deno as unknown as { resolveDns: unknown }).resolveDns = originalResolveDns;
    time.restore();
  }
}

Deno.test("import-source stops reading a body that drips slower than the deadline", async () => {
  await importAgainstSlowServer("drip");
});

Deno.test("import-source stops waiting for a body that never arrives", async () => {
  await importAgainstSlowServer("stall");
});

Deno.test("import-source stops waiting for a request body that never finishes", async () => {
  const time = new FakeTime();
  const originalFetch = globalThis.fetch;
  const sourceRequests: string[] = [];
  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", aud: "authenticated" });
    if (url.pathname.includes("/rest/v1/user_roles")) return Response.json({ role: "user" });
    if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) return Response.json([{ allowed: true, current_count: 1 }]);
    if (url.pathname.includes("/rest/v1/rpc/refund_daily_quota")) return Response.json(0);
    if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
    sourceRequests.push(url.toString());
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  let requestCancelled = false;
  const stalledUpload = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"url": "https://exam'));
    },
    pull: () => new Promise<void>(() => {}),
    cancel() {
      requestCancelled = true;
    },
  });

  try {
    let settled: Response | undefined;
    const pending = handleRequest(new Request("http://127.0.0.1/functions/v1/import-source", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: stalledUpload,
      duplex: "half",
    } as RequestInit)).then((response) => (settled = response));

    for (let elapsed = 0; elapsed < 11_000 && !settled; elapsed += 250) {
      await time.tickAsync(250);
    }
    if (!settled) throw new Error("import-source was still reading the request body after 11 s");
    await pending;

    const body = await settled.json();
    if (settled.status !== 408) throw new Error(`expected 408, got ${settled.status}: ${JSON.stringify(body)}`);
    if (!requestCancelled) throw new Error("the request body was not cancelled at the deadline");
    if (sourceRequests.length) throw new Error(`a source was fetched: ${sourceRequests}`);
  } finally {
    globalThis.fetch = originalFetch;
    time.restore();
  }
});
