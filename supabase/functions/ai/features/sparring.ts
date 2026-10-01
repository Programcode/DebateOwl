import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage } from "../../_shared/cost.ts";
import { callAI } from "../provider.ts";
import { cleanGeneratedText } from "../text.ts";
import { buildUserPrompt } from "../prompt-builder.ts";
import {
  completeClaimedSparringScoreSession,
  createSparringSpeechIntegrityToken,
  normalizeSparringOutput,
  parseSparringProviderOutput,
  type SparringDatabase,
  type SparringRequest,
} from "../sparring-persistence.ts";
import { sparringIntegritySecret } from "../runtime.ts";
import { prepareVoiceReply, type VoicePayload } from "../../_shared/voice-token.ts";
import type { FeatureContext } from "./types.ts";

export interface SparringHandlerOptions {
  request: SparringRequest | undefined;
  database: SparringDatabase;
  /** Token from the score claim taken before quota was reserved. */
  claimToken: string | undefined;
  /** Called once the scorecard is saved, so the claim is not released. */
  onScoreSaved: () => void;
}

// SPARRING: transcript-only opponent replies and scorecards. No research
// branch runs here, and score persistence follows output validation.
export async function handleSparring(ctx: FeatureContext, options: SparringHandlerOptions): Promise<Response> {
  const feature = "sparring" as const;
  const { userId, provider, model, temperature, reasoningEffort, workSignal, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor } = ctx;
  const { request: sparringRequest, database: sparringDatabase, claimToken: sparringScoreClaimToken } = options;
  if (!sparringRequest) throw new Error("Invalid sparring request");

  const systemPrompt = await buildSystemPromptFor(feature);
  const userPrompt = buildUserPrompt(feature, sparringRequest as unknown as Record<string, unknown>, "");
  const messages = [{ role: "user", content: userPrompt }];
  const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, workSignal));
  const output = cleanGeneratedText(aiResult.output);
  const normalizedOutput = normalizeSparringOutput(output, sparringRequest.action);
  const parsedOutput = parseSparringProviderOutput(normalizedOutput, sparringRequest.action);
  if (!parsedOutput) throw new Error("AI response did not match the expected sparring schema");

  // In a voice round the speech may carry audio tags. They go to the voice
  // only: the content that is shown, signed, and saved has none.
  let voice: VoicePayload | undefined;
  if (parsedOutput.action === "respond" && ctx.voice) {
    const reply = await prepareVoiceReply(userId, feature, parsedOutput.speech.content);
    if (!reply.clean) throw new Error("AI response did not match the expected sparring schema");
    parsedOutput.speech.content = reply.clean;
    voice = reply.voice;
  }

  if (parsedOutput.action === "score") {
    await completeClaimedSparringScoreSession(
      sparringDatabase,
      sparringRequest,
      userId,
      sparringScoreClaimToken!,
      parsedOutput.scorecard,
    );
    options.onScoreSaved();
  }

  const responseOutput = parsedOutput.action === "respond"
    ? {
      ...parsedOutput,
      speech: {
        ...parsedOutput.speech,
        integrityToken: await createSparringSpeechIntegrityToken(
          sparringRequest,
          userId,
          {
            turnId: sparringRequest.currentTurn!.id,
            side: sparringRequest.currentTurn!.side,
            content: parsedOutput.speech.content,
          },
          sparringIntegritySecret,
        ),
      },
    }
    : parsedOutput;

  const latencyMs = Date.now() - startTime;
  await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
  return await ctx.respond({
    output: responseOutput,
    sessionId: sparringRequest.sessionId,
    ...(voice ? { voice } : {}),
  });
}
