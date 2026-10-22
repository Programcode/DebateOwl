import { logUsage } from "../../_shared/entitlements.ts";
import { callAI } from "../provider.ts";
import { cleanGeneratedText, getCurrentDateContext } from "../text.ts";
import { buildCrossfireNextTurnPrompt, buildCrossfireDebriefPrompt } from "../prompt-builder.ts";
import { buildSystemPrompt, type DebatePromptContext, type PromptSource } from "../../_shared/prompts.ts";
import { validateCrossfireDebrief } from "../../_shared/crossfire-response.ts";
import {
  createCrossfireSignalToken,
  type CrossfireInput,
  crossfireReplyOutput,
  MAX_CROSSFIRE_PROMPT_CHARS,
} from "./crossfire-input.ts";
import { prepareVoiceReply, type VoicePayload } from "../../_shared/voice-token.ts";
import type { FeatureContext } from "./types.ts";

export interface CrossfireHandlerOptions {
  input: CrossfireInput | undefined;
  /** Library sources validated for this round. */
  sources: PromptSource[];
  /** Authorized workspace context, when the request came from a workspace. */
  workspaceSources: PromptSource[] | null;
  /** Current Debate material without free-form instructions. */
  debateContext: DebatePromptContext | null;
  /** Called when saved results are left out so the prompt fits its budget. */
  onOutputsOmittedForSize: () => void;
}

// CROSSFIRE: transcript-grounded next turns and debriefs. Custom prompts never
// apply, and the combined prompt stays inside a fixed character budget.
export async function handleCrossfire(ctx: FeatureContext, options: CrossfireHandlerOptions): Promise<Response> {
  const feature = "crossfire" as const;
  const { userId, provider, model, reasoningEffort, workSignal, startTime, recordMainResult } = ctx;
  const { input: crossfireInput, sources: crossfireSources, workspaceSources } = options;

  if (!crossfireInput) throw new Error("Crossfire input was not validated");
  const userPrompt = crossfireInput.operation === "next-turn"
    ? buildCrossfireNextTurnPrompt({ ...crossfireInput, voice: ctx.voice })
    : buildCrossfireDebriefPrompt(crossfireInput);
  if (userPrompt.length > MAX_CROSSFIRE_PROMPT_CHARS) {
    throw new Error(`Crossfire prompt exceeds ${MAX_CROSSFIRE_PROMPT_CHARS} characters`);
  }
  const buildPrompt = (debateContext: DebatePromptContext | null) => buildSystemPrompt({
    feature: "crossfire",
    dateContext: getCurrentDateContext(),
    sources: workspaceSources
      ? workspaceSources.map((source) => ({ ...source, content: source.content.slice(0, 8_000) }))
      : crossfireSources,
    debateContext,
  });
  let systemPrompt = buildPrompt(options.debateContext);
  // A full round can leave no room for saved results. The transcript and the
  // student's sources matter more, so the results go and the response says so.
  if (systemPrompt.length + userPrompt.length > MAX_CROSSFIRE_PROMPT_CHARS && options.debateContext?.outputs.length) {
    systemPrompt = buildPrompt({ ...options.debateContext, outputs: [] });
    options.onOutputsOmittedForSize();
  }
  if (systemPrompt.length + userPrompt.length > MAX_CROSSFIRE_PROMPT_CHARS) {
    throw new Error(`Crossfire prompt exceeds ${MAX_CROSSFIRE_PROMPT_CHARS} characters`);
  }
  const aiResult = recordMainResult(await callAI(
    provider,
    model,
    systemPrompt,
    [{ role: "user", content: userPrompt }],
    reasoningEffort,
    crossfireInput.operation === "next-turn" ? "crossfireTurn" : "crossfireDebrief",
    workSignal,
    ctx.stream,
  ));
  const cleanedOutput = cleanGeneratedText(aiResult.output);
  const output = crossfireInput.operation === "next-turn"
    ? crossfireReplyOutput(cleanedOutput, crossfireInput.expectedReply)
    : validateCrossfireDebrief(cleanedOutput, crossfireInput.transcript);
  if ("error" in output) throw new Error(output.error);

  // In a voice round the reply may carry an audio tag. It goes to the voice
  // only: the text that is shown, signed, and saved has none.
  let voice: VoicePayload | undefined;
  if (crossfireInput.operation === "next-turn" && ctx.voice) {
    const spokenReply = output.value as { type: "question" | "answer"; text: string };
    const reply = await prepareVoiceReply(userId, feature, spokenReply.text);
    if (!reply.clean) throw new Error("Crossfire response text is empty or too long");
    spokenReply.text = reply.clean;
    voice = reply.voice;
  }

  let signalToken: string | undefined;
  if (crossfireInput.operation === "next-turn" &&
    ((output.value as { type?: unknown }).type === "answer" || crossfireInput.transcript.at(-1)?.kind === "answer")) {
    signalToken = await createCrossfireSignalToken(userId, {
      config: crossfireInput.config,
      transcript: crossfireInput.transcript,
      reply: output.value as { type: "question" | "answer"; text: string },
    });
  }

  const latencyMs = Date.now() - startTime;
  await logUsage(userId, feature, provider, model, aiResult.usage, latencyMs);
  return await ctx.respond({ output: output.value, ...(signalToken ? { signalToken } : {}), ...(voice ? { voice } : {}) });
}
