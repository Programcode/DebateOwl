// Runs the fourteen prompt examples (two per AI feature) against one real
// OpenRouter model and writes the raw outputs for side-by-side review.
//
//   OPENROUTER_API_KEY=... deno run --allow-read --allow-write --allow-env=OPENROUTER_API_KEY \
//     --allow-net=openrouter.ai scripts/prompt-examples.ts <functions-dir> <out.json> [model] [id,id,...]
//
// <functions-dir> is a directory holding _shared/prompts.ts and
// ai/prompt-builder.ts, so an older copy of the prompts can be compared with
// the current one. This is a bounded manual check, not a model matrix: one
// model, fourteen calls, no web research.

import { PROMPT_EXAMPLES } from "../supabase/functions/_shared/prompts/prompt-examples.ts";
import { openRouterProviderOptions } from "../supabase/functions/_shared/provider-routing.ts";

const [functionsDir, outPath, model = "openai/gpt-6-luna", only] = Deno.args;
const selected = only ? new Set(only.split(",")) : null;
if (!functionsDir || !outPath) {
  console.error("usage: prompt-examples.ts <functions-dir> <out.json> [model]");
  Deno.exit(2);
}
const apiKey = Deno.env.get("OPENROUTER_API_KEY");
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is required");
  Deno.exit(2);
}

const root = new URL(`file://${Deno.realPathSync(functionsDir)}/`);
const prompts = await import(new URL("_shared/prompts.ts", root).href);
const builder = await import(new URL("ai/prompt-builder.ts", root).href);

const results = [];
for (const example of PROMPT_EXAMPLES.filter((item) => !selected || selected.has(item.id))) {
  const sparringScore = example.feature === "sparring" && example.input.action === "score";
  const context = example.debateContext && {
    ...example.debateContext,
    // Mirror the server's per-feature policy.
    instructions: sparringScore || example.feature === "crossfire" ? undefined : example.debateContext.instructions,
    outputs: example.feature === "sparring" ? [] : example.debateContext.outputs,
  };
  const system = prompts.buildSystemPrompt({
    feature: example.feature,
    dateContext: `CURRENT DATE: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    sources: example.feature === "sparring" ? [] : example.sources ?? [],
    debateContext: context,
    researchContext: example.searchContext ? "WEB RESEARCH RESULTS are attached to this request." : undefined,
  });
  const user = example.feature === "ask"
    ? builder.buildAskBasePrompt({
      message: String(example.input.message),
      mode: String(example.input.mode),
      citationMode: false,
      webSearchEnabled: false,
      prosConsMode: false,
      argumentMapMode: false,
      researchAvailable: false,
    })
    : builder.buildUserPrompt(example.feature, example.input, example.searchContext ?? "");
  const started = Date.now();
  const call = () => fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 8_000,
      response_format: { type: "json_object" },
      reasoning: { effort: "low", exclude: true },
      provider: openRouterProviderOptions(model),
    }),
    // Matches the ai function's request budget; one retry covers a stalled route.
    signal: AbortSignal.timeout(120_000),
  });
  const response = await call().catch(() => call()).catch(() => null);
  const data = response ? await response.json().catch(() => null) : null;
  const content = data?.choices?.[0]?.message?.content ?? "";
  let output: unknown = content;
  try {
    output = JSON.parse(content);
  } catch {
    // Keep the raw text so invalid JSON is visible in review.
  }
  results.push({
    id: example.id,
    status: response?.status ?? 0,
    ms: Date.now() - started,
    cost: data?.usage?.cost ?? null,
    systemChars: system.length,
    output,
  });
  console.log(`${example.id}: ${response?.status ?? "timed out"} in ${Date.now() - started} ms`);
}

await Deno.writeTextFile(outPath, JSON.stringify({ model, ranAt: new Date().toISOString(), results }, null, 2));
