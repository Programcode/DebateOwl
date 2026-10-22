// Voice rounds through the real ai entrypoint: audio tags reach only the
// voice payload, typed requests are untouched, and measured delivery facts
// reach the judge and the saved round.

const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-sparring-secret",
  OPENROUTER_API_KEY: "test-openrouter-key",
};
for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");
const { createSparringSpeechIntegrityToken, verifySparringTranscriptIntegrity } = await import("./sparring-persistence.ts");
const { verifyVoiceToken } = await import("../_shared/voice-token.ts");
const { SPARRING_PROMPT, sparringTaskPrompt } = await import("../_shared/prompts.ts");

const USER = "user-1";
const SESSION = "5e551000-0000-4000-8000-000000000001";
const MOTION = "This House would make public transport free";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Harness {
  providerBodies: Array<{ messages: Array<{ role: string; content: string }> }>;
  savedRounds: Array<Record<string, unknown>>;
  restore: () => void;
}

function install(reply: unknown): Harness {
  const originalFetch = globalThis.fetch;
  const harness: Harness = { providerBodies: [], savedRounds: [], restore: () => { globalThis.fetch = originalFetch; } };
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return jsonResponse({ id: USER, aud: "authenticated" });
      if (url.pathname.includes("/rest/v1/user_roles")) return jsonResponse({ role: "user" });
      if (url.pathname.includes("/rest/v1/user_settings")) return jsonResponse({ subscription_tier: "trial", daily_limit_override: 50, trial_ends_at: "2099-01-01T00:00:00.000Z", grace_period_ends_at: null });
      if (url.pathname.includes("/rest/v1/subscriptions")) return jsonResponse([]);
      if (url.pathname.includes("/rest/v1/rate_limits")) {
        if ((url.searchParams.get("order") ?? "").includes("updated_at")) throw new Error(`rate_limits must not order by updated_at: ${url.search}`);
        return jsonResponse({ limit_value: 50 });
      }
      if (/\/rest\/v1\/rpc\/consume_(daily|ai)_quota$/.test(url.pathname)) return jsonResponse([{ allowed: true, current_count: 1 }]);
      if (url.pathname.endsWith("/rest/v1/rpc/claim_ai_session_quota")) return jsonResponse([{ allowed: true, charged: true, units: 1, current_count: 1, charge_id: 1 }]);
      if (/\/rest\/v1\/rpc\/refund_(daily_quota|ai_session_quota)$/.test(url.pathname)) return jsonResponse(1);
      if (url.pathname.includes("/rest/v1/rpc/sparring_request_started_at")) return jsonResponse(new Date().toISOString());
      if (url.pathname.includes("/rest/v1/rpc/claim_sparring_score_session")) {
        const payload = (JSON.parse(String(init?.body)) as { p_payload: { claim_token: string } }).p_payload;
        return jsonResponse({ status: "claimed", token: payload.claim_token });
      }
      if (url.pathname.includes("/rest/v1/sparring_sessions")) {
        harness.savedRounds.push(JSON.parse(String(init?.body)));
        return jsonResponse({ id: SESSION });
      }
      if (url.pathname.includes("/rest/v1/global_prompts")) return jsonResponse({ prompt_text: null });
      if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
      throw new Error(`Unhandled Supabase request: ${url}`);
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      harness.providerBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(reply) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.000001 },
      });
    }
    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;
  return harness;
}

function aiRequest(body: Record<string, unknown>): Request {
  return new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-6-luna", ...body }),
  });
}

function systemPrompt(harness: Harness): string {
  return harness.providerBodies[0].messages.find((message) => message.role === "system")?.content ?? "";
}

function userPrompt(harness: Harness): string {
  return harness.providerBodies[0].messages.find((message) => message.role === "user")?.content ?? "";
}

const sparringContext = { sessionId: SESSION, motion: MOTION, userSide: "pro", format: "ld", difficulty: "medium", language: "en" } as const;

const DELIVERY = {
  speakingSeconds: 312,
  wordCount: 702,
  wordsPerMinute: 135,
  fillerCount: 9,
  fillers: [{ word: "um", count: 6 }, { word: "you know", count: 3 }],
  longPauses: 2,
  longestPauseSeconds: 5,
};

function userSpeech(index: number, extra: Record<string, unknown> = {}) {
  const roles = ["Affirmative constructive", "", "First affirmative rebuttal", "", "Second affirmative rebuttal"];
  const limits = [360, 420, 240, 360, 180];
  return {
    id: `user-${index + 1}`,
    turnId: `ld-${index + 1}`,
    speaker: "user",
    side: "pro",
    role: roles[index],
    content: `User speech ${index + 1}: free fares remove the price barrier.`,
    createdAt: 1_700_000_000_000 + index,
    timeLimitSeconds: limits[index],
    timeUsedSeconds: 120,
    ...extra,
  };
}

async function aiSpeech(index: number, content: string) {
  const roles = ["", "Negative constructive", "", "Negative rebuttal"];
  const limits = [0, 420, 0, 360];
  return {
    id: `ai-${index + 1}`,
    turnId: `ld-${index + 1}`,
    speaker: "ai",
    side: "con",
    role: roles[index],
    content,
    createdAt: 1_700_000_000_000 + index,
    timeLimitSeconds: limits[index],
    timeUsedSeconds: 60,
    integrityToken: await createSparringSpeechIntegrityToken(sparringContext, USER, { turnId: `ld-${index + 1}`, side: "con", content }, "test-sparring-secret"),
  };
}

const respondInput = {
  ...sparringContext,
  action: "respond",
  speeches: [userSpeech(0)],
  currentTurn: { id: "ld-2", label: "Negative constructive", side: "con", kind: "constructive", timeLimitSeconds: 420 },
};

const TAGGED_SPEECH = "[sighs] Free fares sound generous. [stage whisper] They are not. [pause] Who pays for the buses?";
const CLEAN_SPEECH = "Free fares sound generous. They are not. Who pays for the buses?";

Deno.test("a voice sparring reply sends tags to the voice and clean, signed text to the transcript", async () => {
  const harness = install({ action: "respond", speech: { content: TAGGED_SPEECH, strategy: "Press the funding gap.", targetedPoints: ["price barrier"] } });
  try {
    const response = await handleRequest(aiRequest({ feature: "sparring", input: respondInput, voice: true }));
    const body = await response.json();
    assert(response.status === 200, `status ${response.status}: ${JSON.stringify(body)}`);

    assert(systemPrompt(harness).includes("SPOKEN ROUND:"), "the opponent was not told the speech is spoken");
    assert(systemPrompt(harness).includes("[sarcastic]"), "the prompt does not list the audio tags");

    const speech = body.output.speech;
    assert(speech.content === CLEAN_SPEECH, `the transcript text kept a tag: ${speech.content}`);
    assert(!/\[[a-z]/i.test(JSON.stringify(body.output)), "an audio tag reached the output");

    // The integrity token covers the clean text, so the next request verifies.
    const transcript = { ...sparringContext, action: "respond" as const, speeches: [{ ...userSpeech(0), speaker: "user" as const, side: "pro" as const }, {
      id: "ai-2", turnId: "ld-2", speaker: "ai" as const, side: "con" as const, role: "Negative constructive", content: speech.content,
      createdAt: 1, timeLimitSeconds: 420, timeUsedSeconds: 60, integrityToken: speech.integrityToken,
    }] };
    assert(await verifySparringTranscriptIntegrity(transcript, USER, "test-sparring-secret"), "the clean speech did not verify");

    const segments = body.voice.segments as Array<{ text: string; token: string }>;
    assert(segments.length === 1, "expected one voice segment");
    assert(segments[0].text === "[sighs] Free fares sound generous. They are not. ... Who pays for the buses?", `wrong spoken text: ${segments[0].text}`);
    assert(await verifyVoiceToken(USER, "sparring", segments[0].text, segments[0].token), "the voice token did not verify");
  } finally {
    harness.restore();
  }
});

Deno.test("a typed sparring reply is untouched: no voice rules, no voice payload", async () => {
  const harness = install({ action: "respond", speech: { content: "Free fares cost [1] more than they return.", strategy: "Press the funding gap.", targetedPoints: ["price barrier"] } });
  try {
    const response = await handleRequest(aiRequest({ feature: "sparring", input: respondInput }));
    const body = await response.json();
    assert(response.status === 200, `status ${response.status}`);
    assert(!systemPrompt(harness).includes("SPOKEN ROUND:"), "a typed round got voice rules");
    assert(systemPrompt(harness).includes("The round is typed:"), "the typed wording changed");
    assert(body.voice === undefined, "a typed round got a voice payload");
    assert(body.output.speech.content === "Free fares cost [1] more than they return.", "typed content was rewritten");
  } finally {
    harness.restore();
  }
});

Deno.test("the typed sparring prompt is the original prompt", () => {
  assert(sparringTaskPrompt() === SPARRING_PROMPT, "the default task prompt drifted");
  assert(sparringTaskPrompt({ spokenReplies: false, measuredDelivery: false }) === SPARRING_PROMPT, "disabled voice options changed the prompt");
  const measured = sparringTaskPrompt({ measuredDelivery: true });
  assert(!measured.includes("The round is typed:") && !measured.includes("Delivery is typed and text-based"), "typed wording survived in a measured round");
  assert(measured.includes("You did not hear this round"), "measured wording missing");
});

Deno.test("a voice Crossfire reply sends its tag to the voice and clean text to the transcript", async () => {
  const harness = install({ type: "answer", text: "[scoffs] The fare is the barrier. [laughs] Ask any commuter." });
  const input = {
    operation: "next-turn",
    config: { resolution: MOTION, argument: "Free fares widen access.", mode: "question-ai", style: "aggressive", durationSeconds: 180, useSourceLibrary: false, seedQuestions: [] },
    transcript: [{ id: "T1", sequence: 1, speaker: "user", kind: "question", text: "What is the barrier?", createdAt: 1 }],
    expectedReply: "answer",
    language: "en",
  };
  try {
    const response = await handleRequest(aiRequest({ feature: "crossfire", input, voice: true }));
    const body = await response.json();
    assert(response.status === 200, `status ${response.status}: ${JSON.stringify(body)}`);
    assert(userPrompt(harness).includes("SPOKEN EXCHANGE:"), "the opponent was not told the reply is spoken");
    assert(body.output.text === "The fare is the barrier. Ask any commuter.", `the transcript text kept a tag: ${body.output.text}`);
    assert(Object.keys(body.output).sort().join() === "text,type", "the reply gained a field");
    const [segment] = body.voice.segments as Array<{ text: string; token: string }>;
    assert(segment.text === "[scoffs] The fare is the barrier. Ask any commuter.", `wrong spoken text: ${segment.text}`);
    assert(await verifyVoiceToken(USER, "crossfire", segment.text, segment.token), "the voice token did not verify");
    assert(typeof body.signalToken === "string", "the signal token was lost");
  } finally {
    harness.restore();
  }

  const typed = install({ type: "answer", text: "The fare is the barrier." });
  try {
    const response = await handleRequest(aiRequest({ feature: "crossfire", input }));
    const body = await response.json();
    assert(response.status === 200, `status ${response.status}`);
    assert(!userPrompt(typed).includes("SPOKEN EXCHANGE:"), "a typed exchange got voice rules");
    assert(body.voice === undefined, "a typed exchange got a voice payload");
  } finally {
    typed.restore();
  }
});

const SCORECARD = {
  action: "score",
  scorecard: {
    userScore: 78,
    aiScore: 74,
    categories: [
      { name: "Logic", userScore: 20, aiScore: 18, feedback: "Clear chain." },
      { name: "Evidence", userScore: 18, aiScore: 18, feedback: "Thin support." },
      { name: "Delivery", userScore: 19, aiScore: 19, feedback: "135 words per minute with nine filler words." },
      { name: "Strategy", userScore: 21, aiScore: 19, feedback: "Good weighing." },
    ],
    overallFeedback: "A narrow win.",
    keyMoments: ["The rebuttal."],
    improvementAreas: ["Weigh earlier."],
    winner: "user",
    verdict: "User by a small margin.",
  },
};

async function completedRound(firstSpeechExtra: Record<string, unknown>) {
  return [
    userSpeech(0, firstSpeechExtra),
    await aiSpeech(1, "The cost falls on those who never ride."),
    userSpeech(2),
    await aiSpeech(3, "Targeted passes reach the same riders for less."),
    userSpeech(4),
  ];
}

Deno.test("measured delivery facts reach the judge and the saved round", async () => {
  const harness = install(SCORECARD);
  try {
    const speeches = await completedRound({ delivery: DELIVERY });
    const response = await handleRequest(aiRequest({ feature: "sparring", input: { ...sparringContext, action: "score", speeches } }));
    assert(response.status === 200, `status ${response.status}: ${await response.text()}`);

    const system = systemPrompt(harness);
    assert(system.includes("You did not hear this round"), "the judge was not told what it may say about delivery");
    assert(system.includes("never comment on tone, confidence, volume"), "the judge may claim to have heard the speaker");
    assert(!system.includes("The round is typed:"), "typed wording survived in a spoken round");
    assert(userPrompt(harness).includes('"wordsPerMinute":135'), "the measurements did not reach the judge");

    const saved = harness.savedRounds.at(-1)?.turns as Array<Record<string, unknown>>;
    assert(JSON.stringify(saved[0].delivery) === JSON.stringify(DELIVERY), "the measurements were not saved with the speech");
    assert(saved[2].delivery === undefined, "a typed speech gained measurements");
  } finally {
    harness.restore();
  }
});

Deno.test("a typed round is judged with the typed wording, and malformed or forged measurements are dropped", async () => {
  for (const extra of [{}, { delivery: { ...DELIVERY, wordsPerMinute: "fast" } }, { delivery: { ...DELIVERY, fillers: [{ word: "", count: 1 }] } }]) {
    const harness = install(SCORECARD);
    try {
      const speeches = await completedRound(extra);
      // The opponent never speaks into a microphone, so its turns carry none.
      (speeches[1] as Record<string, unknown>).delivery = DELIVERY;
      const response = await handleRequest(aiRequest({ feature: "sparring", input: { ...sparringContext, action: "score", speeches } }));
      assert(response.status === 200, `status ${response.status}: ${await response.text()}`);
      assert(systemPrompt(harness).includes("The round is typed:"), "the typed wording changed");
      assert(!userPrompt(harness).includes("wordsPerMinute"), "dropped measurements reached the judge");
      const saved = harness.savedRounds.at(-1)?.turns as Array<Record<string, unknown>>;
      assert(saved.every((speech) => speech.delivery === undefined), "dropped measurements were saved");
    } finally {
      harness.restore();
    }
  }
});

Deno.test("the opponent does not see delivery measurements while the round is live", async () => {
  const harness = install({ action: "respond", speech: { content: "A plain reply.", strategy: "Hold the line.", targetedPoints: ["cost"] } });
  try {
    const input = { ...respondInput, speeches: [userSpeech(0, { delivery: DELIVERY })] };
    const response = await handleRequest(aiRequest({ feature: "sparring", input, voice: true }));
    assert(response.status === 200, `status ${response.status}`);
    assert(!userPrompt(harness).includes("wordsPerMinute"), "measurements reached the opponent");
  } finally {
    harness.restore();
  }
});
