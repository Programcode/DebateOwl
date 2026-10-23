import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage, type NormalizedUsage, selectObservedUsage } from "../../_shared/cost.ts";
import { ClaudeProviderUnavailableError } from "../../_shared/provider-routing.ts";
import { type AIResult, callAI, InvalidJsonResponseError, isIncompleteProviderStream, missingOpenRouterUsage } from "../provider.ts";
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

// The judge gets one more attempt inside the same request when the first one
// produced no scorecard for a reason another try can fix: a reply that failed
// the schema, a provider outage, or a dropped provider stream. The round has
// already paid, so the retry costs the student nothing and spares them
// "Try scoring again". A failed save is not retried, and neither is a run
// that has used up this much of its time.
const JUDGE_RETRY_BEFORE_MS = 60_000;

class InvalidSparringOutputError extends Error {
  constructor(readonly usage?: NormalizedUsage, readonly completedUsage?: NormalizedUsage) {
    super("AI response did not match the expected sparring schema");
    this.name = "InvalidSparringOutputError";
  }
}

function judgeMayRetry(error: unknown): boolean {
  if (error instanceof InvalidSparringOutputError || error instanceof InvalidJsonResponseError) return true;
  if (isIncompleteProviderStream(error)) return true;
  // 401, 402 and 403 are the key or its credit, which a retry does not fix.
  return error instanceof ClaudeProviderUnavailableError && (error.status === null || error.status === 429 || error.status >= 500);
}

// SPARRING: transcript-only opponent replies and scorecards. No research
// branch runs here, and score persistence follows output validation.
export async function handleSparring(ctx: FeatureContext, options: SparringHandlerOptions): Promise<Response> {
  const feature = "sparring" as const;
  const { userId, provider, model, reasoningEffort, workSignal, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor } = ctx;
  const { request: sparringRequest, database: sparringDatabase, claimToken: sparringScoreClaimToken } = options;
  if (!sparringRequest) throw new Error("Invalid sparring request");

  const systemPrompt = await buildSystemPromptFor(feature);
  const userPrompt = buildUserPrompt(feature, sparringRequest as unknown as Record<string, unknown>, "");
  const messages = [{ role: "user", content: userPrompt }];
  const callModel = () => callAI(
    provider,
    model,
    systemPrompt,
    messages,
    reasoningEffort,
    sparringRequest.action === "score" ? "sparringScore" : "sparringSpeech",
    workSignal,
    ctx.stream,
  );
  const readOutput = (result: AIResult) =>
    parseSparringProviderOutput(normalizeSparringOutput(cleanGeneratedText(result.output), sparringRequest.action), sparringRequest.action);

  let aiResult: AIResult;
  let parsedOutput: ReturnType<typeof readOutput>;
  if (sparringRequest.action === "score") {
    const judge = async (earlierUsage?: NormalizedUsage) => {
      const result = await callModel();
      const usage = mergeNormalizedUsage([earlierUsage, result.usage]);
      const parsed = readOutput(result);
      // The call completed, so its tokens are billed even though it failed.
      if (!parsed) throw new InvalidSparringOutputError(usage, usage);
      return { result: recordMainResult({ ...result, usage }), parsed };
    };
    let judged: Awaited<ReturnType<typeof judge>>;
    try {
      judged = await judge();
    } catch (error) {
      if (!judgeMayRetry(error) || workSignal.aborted || Date.now() - startTime > JUDGE_RETRY_BEFORE_MS) throw error;
      const firstUsage = selectObservedUsage(error as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }, false)
        ?? missingOpenRouterUsage("judge_attempt");
      console.warn(`[SPARRING] Judge attempt failed (${error instanceof Error ? error.name : "unknown"}); trying once more`);
      // The first attempt's draft is void; the scorecard is written again.
      ctx.stream?.reset();
      try {
        judged = await judge(firstUsage);
      } catch (retryError) {
        // Bill the first attempt with whatever the second one cost.
        if (retryError && typeof retryError === "object" && !(retryError instanceof InvalidSparringOutputError)) {
          const withUsage = retryError as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage };
          withUsage.usage = mergeNormalizedUsage([firstUsage, withUsage.usage ?? missingOpenRouterUsage("judge_retry")]);
          withUsage.completedUsage = mergeNormalizedUsage([firstUsage, withUsage.completedUsage]);
        }
        throw retryError;
      }
    }
    aiResult = judged.result;
    parsedOutput = judged.parsed;
  } else {
    aiResult = recordMainResult(await callModel());
    parsedOutput = readOutput(aiResult);
  }
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
