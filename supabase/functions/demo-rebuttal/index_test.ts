import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

for (const [key, value] of Object.entries({
  DEMO_ENABLED: "true",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-integrity-secret",
  OPENROUTER_API_KEY: "test-openrouter-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

type Session = { id: string; ip_hash: string; turns: number };
type ModelReply = { content: string; finish_reason?: string };

/**
 * Runs requests against the handler with Turnstile, the claim RPC and
 * OpenRouter faked. The RPC keeps sessions like claim_demo_round_turn does:
 * a follow-up must name an existing session with the same ip_hash.
 */
function harness(modelReply: ModelReply = { content: JSON.stringify({ allowed: true, rebuttal: "Phones help in emergencies.", judgeNote: "Say how a ban is enforced." }) }) {
  const sessions: Session[] = [];
  const rpcCalls: Array<Record<string, unknown>> = [];
  let modelCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "challenges.cloudflare.com") {
      const form = await request.formData();
      return Response.json({ success: form.get("response") === "good-turnstile-token" });
    }
    if (url.pathname === "/rest/v1/rpc/claim_demo_round_turn") {
      const body = await request.json() as Record<string, unknown>;
      rpcCalls.push(body);
      if (body.p_session_id === null) {
        const session = { id: crypto.randomUUID(), ip_hash: String(body.p_ip_hash), turns: 1 };
        sessions.push(session);
        return Response.json([{ status: "ok", session_id: session.id }]);
      }
      const session = sessions.find((item) => item.id === body.p_session_id && item.ip_hash === body.p_ip_hash);
      if (!session) return Response.json([{ status: "unknown_session", session_id: null }]);
      if (session.turns >= 2) return Response.json([{ status: "turn_limit", session_id: session.id }]);
      session.turns += 1;
      return Response.json([{ status: "ok", session_id: session.id }]);
    }
    if (url.pathname === "/api/v1/chat/completions") {
      modelCalls += 1;
      return Response.json({ choices: [{ message: { content: modelReply.content }, finish_reason: modelReply.finish_reason ?? "stop" }] });
    }
    throw new Error(`Unhandled request: ${request.method} ${url}`);
  }) as typeof fetch;

  const send = async (ip: string, body: Record<string, unknown>, headers: Record<string, string> = { "X-Real-IP": ip }) => {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/demo-rebuttal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://debateowl.com", ...headers },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const firstTurn = { turnstileToken: "good-turnstile-token", motion: "This House would ban smartphones in schools", side: "for", argument: "Phones distract pupils." };
  return {
    send,
    firstTurn,
    rpcCalls,
    modelCalls: () => modelCalls,
    restore: () => (globalThis.fetch = originalFetch),
  };
}

Deno.test("a follow-up from a different IP continues the round with its signed session", async () => {
  const demo = harness();
  try {
    const first = await demo.send("198.51.100.7", demo.firstTurn);
    assertEquals(first.status, 200);
    assert(typeof first.body.sessionToken === "string");

    // A phone that moved from Wi-Fi to mobile data: same session, new IP.
    const second = await demo.send("203.0.113.40", {
      ...demo.firstTurn,
      turnstileToken: undefined,
      sessionId: first.body.sessionId,
      sessionToken: first.body.sessionToken,
      argument: "The office phone covers emergencies.",
      previous: { argument: demo.firstTurn.argument, rebuttal: first.body.rebuttal },
    });
    assertEquals(second.status, 200);
    assertEquals(second.body.turnsLeft, 0);
    // The follow-up is charged to the session's first IP, not checked against the new one.
    assertEquals(demo.rpcCalls[1].p_ip_hash, demo.rpcCalls[0].p_ip_hash);
  } finally {
    demo.restore();
  }
});

Deno.test("a follow-up without a valid session token is refused before any limit or model call", async () => {
  const demo = harness();
  try {
    const first = await demo.send("198.51.100.7", demo.firstTurn);
    const token = String(first.body.sessionToken);
    const followUp = { ...demo.firstTurn, turnstileToken: undefined, sessionId: first.body.sessionId, argument: "Reply.", previous: { argument: "A", rebuttal: "B" } };
    const forged = token.slice(0, -2) + (token.endsWith("00") ? "11" : "00");
    const otherSession = token.replace(String(first.body.sessionId), crypto.randomUUID());
    for (const sessionToken of [undefined, "not-a-token", forged, otherSession]) {
      const reply = await demo.send("198.51.100.7", { ...followUp, sessionToken });
      assertEquals(reply.status, 400);
      assertEquals(reply.body.error, "unknown_session");
    }
    assertEquals(demo.rpcCalls.length, 1);
    assertEquals(demo.modelCalls(), 1);
  } finally {
    demo.restore();
  }
});

Deno.test("a first turn needs a passing Turnstile token", async () => {
  const demo = harness();
  try {
    for (const turnstileToken of [undefined, "bad-turnstile-token"]) {
      const reply = await demo.send("198.51.100.7", { ...demo.firstTurn, turnstileToken });
      assertEquals(reply.status, 403);
      assertEquals(reply.body.error, "bot_check_failed");
    }
    assertEquals(demo.rpcCalls.length, 0);
  } finally {
    demo.restore();
  }
});

Deno.test("first turns from one visitor count against one IP even when the proxy hop changes", async () => {
  const demo = harness();
  try {
    // What hosted Supabase forwards: the client twice, then an internal hop that varies per request.
    for (const hop of ["10.0.0.11", "10.0.0.42"]) {
      const reply = await demo.send("", demo.firstTurn, { "CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": `198.51.100.7,198.51.100.7, ${hop}` });
      assertEquals(reply.status, 200);
    }
    assertEquals(demo.rpcCalls[0].p_ip_hash, demo.rpcCalls[1].p_ip_hash);
  } finally {
    demo.restore();
  }
});

Deno.test("a reply cut off at max_tokens is served up to its last full sentence", async () => {
  const cutOff = '{"allowed": true, "rebuttal": "Phones are a lifeline. A ban leaves pupils unreachable. And it fails the very';
  const demo = harness({ content: cutOff, finish_reason: "length" });
  try {
    const reply = await demo.send("198.51.100.7", demo.firstTurn);
    assertEquals(reply.status, 200);
    assertEquals(reply.body.rebuttal, "Phones are a lifeline. A ban leaves pupils unreachable.");
    assertEquals(reply.body.judgeNote, "");
  } finally {
    demo.restore();
  }
});

Deno.test("a cut-off reply whose moderation flag did not arrive is not served", async () => {
  const demo = harness({ content: '{"rebuttal": "Phones are a lifeline. A ban', finish_reason: "length" });
  try {
    const reply = await demo.send("198.51.100.7", demo.firstTurn);
    assertEquals(reply.status, 502);
  } finally {
    demo.restore();
  }
});

Deno.test("an over-long rebuttal ends on a full sentence, not mid-sentence", async () => {
  const sentence = "Every pupil deserves a way to call home when something goes wrong at school. ";
  const rebuttal = sentence.repeat(14).trim(); // 14 sentences, 196 words
  const demo = harness({ content: JSON.stringify({ allowed: true, rebuttal, judgeNote: "Weigh it." }) });
  try {
    const reply = await demo.send("198.51.100.7", demo.firstTurn);
    const served = String(reply.body.rebuttal);
    assert(served.endsWith("goes wrong at school."), served.slice(-40));
    assert(served.split(/\s+/).length <= 170);
  } finally {
    demo.restore();
  }
});
