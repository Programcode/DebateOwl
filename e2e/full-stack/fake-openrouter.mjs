// Deterministic stand-in for OpenRouter used by the full-stack browser gate.
// The real `ai` and `ai-stream` Edge Functions call it through
// OPENROUTER_API_URL, so their auth, quota, source loading, prompt building,
// and output validation all run for real. Unknown prompts fail loudly: a prompt
// change must update this file rather than silently receive a generic answer.
//
// With UPSTREAM set, it becomes a recording proxy for the live gate instead:
// every chat call goes to the real provider with the model pinned to
// LIVE_MODEL, and calls past MAX_UPSTREAM_CALLS are refused to bound cost.
// LIVE_MODEL=as-requested forwards the model the Edge Function chose.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8787);
const upstream = process.env.UPSTREAM;
const liveModel = process.env.LIVE_MODEL;
const chatModel = (requested) => (liveModel === "as-requested" ? requested : liveModel);
const maxUpstreamCalls = Number(process.env.MAX_UPSTREAM_CALLS ?? 200);
if (upstream && !liveModel) throw new Error("LIVE_MODEL is required with UPSTREAM");
const requests = [];
// Subscription state the fake Stripe returns, set by tests through /__subscription.
const subscriptions = new Map();
let failures = [];
let upstreamCalls = 0;
// Delay between streamed chunks; a test can slow it to keep a draft on screen.
let streamDelayMs;

const MARK = "FAKE-PROVIDER";

const STREAM_CHUNK_CHARS = 24;
const STREAM_CHUNK_DELAY_MS = 10;
const usage = { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200, cost: 0.0001 };

const contention = (index) => ({
  id: String(index + 1),
  claim: `${MARK} contention ${index + 1}: fares block the riders who need transit most`,
  reasoning: "Fares are a regressive barrier concentrated on low-income riders.",
  evidence: "Comparable jurisdictions report ridership gains after fare removal.",
  needsSource: false,
  impact: "More people reach work, school, and healthcare.",
});

const generate = (user) => {
  const length = /^Length: (\w+)/m.exec(user)?.[1] ?? "standard";
  const count = { brief: 2, standard: 3, comprehensive: 4 }[length] ?? 3;
  return {
    caseStructure: {
      thesis: `${MARK} case thesis: free transit is a net public good`,
      framework: "Net societal benefit, weighed on access and cost.",
      keyDefinitions: ["Public transport: publicly funded scheduled transit."],
      burdenOfProof: "We must show the policy produces a net gain in practice.",
    },
    contentions: Array.from({ length: count }, (_, index) => contention(index)),
    predictedOpponentCase: {
      likelyArguments: ["The lost farebox revenue has to come from somewhere."],
      strategicWeaknesses: ["Assumes fare revenue is the only funding model."],
      keyClashes: ["Who actually bears the cost."],
    },
    counters: [{
      targetArgument: "Funding gap",
      counterpoint: "Fare collection itself carries substantial overhead.",
      rebuttal: "Net cost is far below headline farebox revenue.",
    }],
    metadata: { side: "pro", format: "custom", generatedAt: new Date().toISOString() },
  };
};

const attack = () => ({
  overallAssessment: {
    score: 62,
    summary: `${MARK} attack summary: the central warrant is underdefended.`,
    strengthAreas: ["Clear thesis"],
  },
  weaknesses: [{
    id: "w1",
    severity: "major",
    type: "evidential",
    description: `${MARK} weakness: the congestion claim has no comparative evidence.`,
    whyWeak: "Correlation between fare policy and congestion is asserted, not shown.",
    howOpponentAttacks: "Name a city where ridership rose and congestion did not fall.",
    improvedVersion: "Cite a before/after study with a control corridor.",
  }],
  fallaciesDetected: [{ name: "Hasty generalization", location: "Second contention", explanation: "One city generalized to all." }],
  crossExQuestions: [{ question: "Which funding line replaces the farebox?", purpose: "Force a concrete mechanism.", expectedTrap: "A vague appeal to general taxation." }],
  weighingAnalysis: {
    currentWeighing: "Access is asserted to outweigh cost without comparison.",
    missingComparisons: ["Cost per additional rider versus targeted subsidy."],
    improvementSuggestions: ["Weigh against the strongest alternative."],
  },
});

const idea = (index, side) => ({
  id: `i${index}`,
  title: `${MARK} idea ${index}: access as a precondition for participation`,
  description: "Mobility gates work, education, and civic life.",
  side,
  strength: "strong",
  tradeoffs: ["Requires a durable funding source."],
  relatedTo: [],
});

const brainstorm = () => ({
  needsMoreInfo: false,
  topFive: [1, 2, 3, 4, 5].map((rank) => ({ rank, idea: idea(rank, rank % 2 ? "pro" : "con"), whyTop: "It reaches the widest impact." })),
  nextSteps: ["Find a before/after ridership study."],
  warningsAndTradeoffs: ["Do not overclaim the congestion effect."],
});

const factoids = () => ({
  factoids: [],
  searchSuggestions: [`${MARK} search suggestion`],
  warnings: [],
  verificationStatus: "complete",
});

const ask = () => ({
  response: `${MARK} answer: weigh access against cost by naming who bears each.`,
  followUpQuestions: ["What is the strongest alternative policy?"],
  uncertainties: [],
});

// In a voice round the prompt allows audio tags. The fake uses one allowed tag
// and one invented tag, so the journey can prove neither reaches the page.
const sparring = (user, system) => /^SPARRING ACTION: score/m.test(user)
  ? {
    action: "score",
    scorecard: {
      userScore: 78,
      aiScore: 74,
      categories: ["Logic", "Evidence", "Delivery", "Strategy"].map((name) => ({ name, userScore: 20, aiScore: 18, feedback: `${name} feedback.` })),
      overallFeedback: "The user won a narrow edge by weighing the main mechanism.",
      keyMoments: ["The rebuttal answered the strongest objection."],
      improvementAreas: ["Compare the alternative policy explicitly."],
      winner: "user",
      verdict: `${MARK} verdict: the user had the edge.`,
    },
  }
  : {
    action: "respond",
    speech: {
      content: system.includes("SPOKEN ROUND:")
        ? `[sighs] ${MARK} opponent speech: the policy needs a stronger comparative case. [dramatic gasp] It is not there yet.`
        : `${MARK} opponent speech: the policy needs a stronger comparative case.`,
      strategy: "Test the warrant, then weigh the alternative.",
      targetedPoints: ["The comparative mechanism is underdeveloped."],
    },
  };

const crossfire = (user) => {
  if (user.startsWith("CROSSFIRE DEBRIEF")) {
    return {
      concessionsSecured: [],
      controlledQuestions: [],
      weakOrRepetitiveQuestions: [],
      evasiveOrIncompleteAnswers: [],
      missedFollowUps: [],
      betterFollowUpQuestions: [],
      strongestExchange: null,
    };
  }
  const type = /must be type "(question|answer)"/.exec(user)?.[1];
  if (!type) return null;
  const tag = user.includes("SPOKEN EXCHANGE:") ? "[scoffs] " : "";
  return { type, text: `${tag}${MARK} crossfire ${type}: what evidence links fewer cars to safer streets?` };
};

// Order matters only where one marker could appear inside another prompt.
const routes = [
  ["research-decision", "You decide whether a debate coaching answer needs live web research", () => ({ shouldSearch: false, query: "" })],
  ["research-queries", "generate 2-3 follow-up search queries", () => ({ queries: [] })],
  ["generate", "Generate a tournament-ready debate case", (user) => generate(user)],
  ["attack", "Analyze the opponent's case clearly", attack],
  ["brainstorm", "Brainstorm arguments like experienced competitive debaters", brainstorm],
  ["factoids", "You are a debate research specialist", factoids],
  ["sparring", "live debate sparring opponent", (user, system) => sparring(user, system)],
  ["crossfire", "You are DebateLab's crossfire coach", (user) => crossfire(user)],
  ["ask", "You are a debate coach chat bot", ask],
];

function classify(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = String(messages.find((message) => message.role === "system")?.content ?? "");
  const user = String(messages.at(-1)?.content ?? "");
  if (body.stream === true && system.includes("Answer in clear Markdown that can stream smoothly")) {
    return { feature: "ask-stream", system, user };
  }
  const route = routes.find(([, marker]) => system.includes(marker));
  if (!route) return { feature: null, system, user };
  return { feature: route[0], system, user, output: route[2](user, system) };
}

function jevAnswers(questions) {
  return Object.fromEntries(Object.entries(questions).map(([id, question]) => {
    if (question.type === "noul") return [id, { type: "noul", noul: 0.8 }];
    const labels = question.type === "choice" ? Object.keys(question.criteria) : question.criteria.map((_, index) => String(index));
    const probabilities = Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 0.9 : 0.1 / (labels.length - 1)]));
    if (question.type === "choice") return [id, { type: "choice", choice: labels[0], confidence: 0.9, probabilities }];
    const legend = Object.fromEntries(question.criteria.map((criterion, index) => [String(index), criterion]));
    return [id, { type: "score", score: 0, confidence: 0.9, probabilities, legend }];
  }));
}

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function stream(res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const chunks = [`${MARK} streamed answer: `, "weigh access ", "against cost."];
  for (const content of chunks) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
  res.end("data: [DONE]\n\n");
}

// Live generation: a structured answer streamed in small chunks, the way a
// model writes tokens, so the client's partial rendering runs for real.
async function streamJson(res, content) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (let index = 0; index < content.length; index += STREAM_CHUNK_CHARS) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(index, index + STREAM_CHUNK_CHARS) } }] })}\n\n`);
    await new Promise((resolve) => setTimeout(resolve, streamDelayMs ?? STREAM_CHUNK_DELAY_MS));
  }
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
  res.end("data: [DONE]\n\n");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function proxy(req, res, path) {
  const body = JSON.parse(await readBody(req));
  const chat = path === "/api/v1/chat/completions";
  const record = chat
    ? { ...classify(body), requestedModel: body.model, model: chatModel(body.model), stream: body.stream === true }
    : { feature: "jev", model: body.model };
  delete record.output;
  requests.push(record);
  // Forced failures (fake.fail) apply in live mode too, before any spend.
  const failure = chat && failures.find((item) => item.count > 0 && (!item.feature || item.feature === record.feature));
  if (failure) {
    failure.count -= 1;
    record.status = failure.status;
    return json(res, failure.status, { error: { message: `Forced ${failure.status} for ${record.feature}` } });
  }
  if (++upstreamCalls > maxUpstreamCalls) {
    record.status = 429;
    return json(res, 429, { error: { message: `Live gate stopped after ${maxUpstreamCalls} provider calls` } });
  }
  const started = Date.now();
  // A caller that hangs up (a cancelled live run) stops the upstream call too.
  // A streamed reply is complete at its finish reason; the caller may close
  // right after it without reading the trailing bytes.
  const hangUp = new AbortController();
  let finished = false;
  res.on("close", () => {
    if (!res.writableEnded) hangUp.abort();
  });
  try {
    const response = await fetch(`${upstream}${path.replace(/^\/api/, "")}`, {
      method: "POST",
      headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" },
      body: JSON.stringify(chat ? { ...body, model: chatModel(body.model) } : body),
      signal: hangUp.signal,
    });
    record.status = response.status;
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json" });
    // Keep the head of the reply: OpenRouter's own `model` and `provider`
    // fields prove which model answered, independent of the rewrite above.
    // A streamed reply names them in its first chunk, so read them as it arrives.
    let head = "";
    let tail = "";
    for await (const chunk of response.body ?? []) {
      tail = (tail + Buffer.from(chunk).toString("utf8")).slice(-4096);
      if (/"finish_reason"\s*:\s*"|data: \[DONE\]/.test(tail)) finished = true;
      if (head.length < 8192) {
        head += Buffer.from(chunk).toString("utf8");
        record.upstreamModel ??= /"model"\s*:\s*"([^"]+)"/.exec(head)?.[1];
        record.upstreamProvider ??= /"provider"\s*:\s*"([^"]+)"/.exec(head)?.[1];
      }
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    if (hangUp.signal.aborted) {
      if (!finished) record.status = 499;
      return;
    }
    record.status = 502;
    const message = error instanceof Error ? error.message : "upstream connection failed";
    console.error(`live provider request failed: ${message}`);
    if (!res.headersSent) json(res, 502, { error: { message: "Live provider request failed" } });
    else res.destroy();
  } finally {
    record.ms = Date.now() - started;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://fake");
  if (url.pathname === "/__requests" && req.method === "GET") return json(res, 200, requests);
  if (url.pathname === "/__stats" && req.method === "GET") {
    return json(res, 200, { mode: upstream ? "live" : "fake", liveModel: liveModel ?? null, upstreamCalls, maxUpstreamCalls });
  }
  if (url.pathname === "/__reset" && req.method === "POST") {
    requests.length = 0;
    failures = [];
    streamDelayMs = undefined;
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/__stream-delay" && req.method === "POST") {
    const { ms } = JSON.parse(await readBody(req) || "{}");
    streamDelayMs = typeof ms === "number" && ms >= 0 ? ms : undefined;
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/__subscription" && req.method === "POST") {
    const subscription = JSON.parse(await readBody(req) || "{}");
    subscriptions.set(subscription.id, subscription);
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/__fail" && req.method === "POST") {
    const { feature, count = 1, status = 500 } = JSON.parse(await readBody(req) || "{}");
    failures.push({ feature, count, status });
    return json(res, 200, { ok: true });
  }
  if (upstream && req.method === "POST" && (url.pathname === "/api/v1/chat/completions" || url.pathname === "/api/alpha/decisions")) {
    return proxy(req, res, url.pathname);
  }
  if (url.pathname === "/api/alpha/decisions" && req.method === "POST") {
    // Confident, schema-valid answers so Jev-dependent paths (Crossfire
    // signals, source ranking) run end to end instead of falling back.
    const body = JSON.parse(await readBody(req));
    requests.push({ feature: "jev", model: body.model, status: 200 });
    return json(res, 200, { model: body.model, answers: jevAnswers(body.questions ?? {}), usage: { input_tokens: 40, output_tokens: 8, cost: 0.00001 } });
  }
  const subscriptionPath = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
  if (subscriptionPath && req.method === "GET") {
    // The webhook applies Stripe's current subscription state, not the event's.
    const subscription = subscriptions.get(decodeURIComponent(subscriptionPath[1]));
    if (!subscription) return json(res, 404, { error: { type: "invalid_request_error", message: "No such subscription" } });
    requests.push({ feature: "stripe-subscription", user: subscription.id });
    return json(res, 200, subscription);
  }
  if (url.pathname === "/v1/customers/search" && req.method === "GET") {
    // Account deletion searches Stripe (through STRIPE_API_URL) for the user's
    // customers. Test accounts have none.
    requests.push({ feature: "stripe-customer-search", user: url.searchParams.get("query") ?? "" });
    return json(res, 200, { object: "search_result", data: [], has_more: false, next_page: null, url: "/v1/customers/search" });
  }
  if (url.pathname !== "/api/v1/chat/completions" || req.method !== "POST") {
    return json(res, 404, { error: { message: `Unexpected ${req.method} ${url.pathname}` } });
  }

  const body = JSON.parse(await readBody(req));
  const { feature, system, user, output } = classify(body);
  requests.push({ feature, model: body.model, stream: body.stream === true, system, user });
  if (!feature) return json(res, 500, { error: { message: "Fake OpenRouter does not recognize this prompt" } });

  const failure = failures.find((item) => item.count > 0 && (!item.feature || item.feature === feature));
  if (failure) {
    failure.count -= 1;
    return json(res, failure.status, { error: { message: `Fake ${feature} failure` } });
  }
  if (feature === "ask-stream") return stream(res);
  if (output === null) return json(res, 500, { error: { message: `Fake ${feature} could not parse the request` } });
  if (body.stream === true) return streamJson(res, JSON.stringify(output));
  return json(res, 200, {
    id: `fake-${requests.length}`,
    model: body.model,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }],
    usage,
  });
}).listen(port, "0.0.0.0", () => console.log(`${upstream ? "live proxy" : "fake OpenRouter"} listening on ${port}`));
