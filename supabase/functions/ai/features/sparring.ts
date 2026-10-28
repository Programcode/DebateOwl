import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage, type NormalizedUsage, selectObservedUsage } from "../../_shared/cost.ts";
import { ClaudeProviderUnavailableError } from "../../_shared/provider-routing.ts";
import { AIResponseValidationError, callAI, isIncompleteProviderStream, missingOpenRouterUsage, withJsonRepairPrompt } from "../provider.ts";
import { cleanGeneratedText } from "../text.ts";
import { buildUserPrompt } from "../prompt-builder.ts";
import {
  completeClaimedSparringScoreSession,
  createSparringSpeechIntegrityToken,
  checkSparringProviderOutput,
  normalizeSparringOutput,
  sparringOutputSchema,
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
  /** Tells the scorer's phones that the round is scored. Must not throw. The ai function always passes it. */
  notifyScored?: (userId: string, sessionId: string) => Promise<void>;
}

// One more attempt runs inside the same request when the first gave no usable
// answer for a reason another try can fix. A reply in the wrong shape (it
// parsed, but a field is missing or wrong) gets a repair prompt naming the
// field; for the judge, a provider outage or a dropped provider stream gets a
// plain retry. A Sparring round has already paid, so the retry costs the
// student nothing and spares them "Try scoring again". A failed save is not
// retried, and neither is a run that has used up this much of its time.
const RETRY_BEFORE_MS = 60_000;

function transientProviderFailure(error: unknown): boolean {
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
  const action = sparringRequest.action;

  const systemPrompt = await buildSystemPromptFor(feature);
  const userPrompt = buildUserPrompt(feature, sparringRequest as unknown as Record<string, unknown>, "");
  const messages = [{ role: "user", content: userPrompt }];
  const outputSchema = sparringOutputSchema(action);
  const callModel = (repairPath?: string) => callAI(
    provider,
    model,
    repairPath === undefined
      ? systemPrompt
      : `${systemPrompt}\n\nJSON REPAIR INSTRUCTION: The previous answer did not match the required shape at "${repairPath}". Return only one JSON object with exactly the fields above, every list item a plain string.`,
    repairPath === undefined ? messages : withJsonRepairPrompt(messages),
    reasoningEffort,
    action === "score" ? "sparringScore" : "sparringSpeech",
    workSignal,
    ctx.stream,
    outputSchema,
  );
  const attempt = async (repairPath?: string, earlierUsage?: NormalizedUsage) => {
    const result = await callModel(repairPath);
    const usage = mergeNormalizedUsage([earlierUsage, result.usage]);
    const checked = checkSparringProviderOutput(normalizeSparringOutput(cleanGeneratedText(result.output), action), action);
    if (!checked.ok) {
      // The field path only: the reply is the student's round and is never logged.
      console.warn(`[SPARRING] ${action} reply failed its shape at ${checked.path}${repairPath === undefined ? "" : " after the repair retry"}`);
      throw new AIResponseValidationError(checked.path, usage);
    }
    return { result: recordMainResult({ ...result, usage }), parsed: checked.value };
  };

  let answered: Awaited<ReturnType<typeof attempt>>;
  try {
    answered = await attempt();
  } catch (error) {
    const wrongShape = error instanceof AIResponseValidationError;
    const retry = wrongShape || (action === "score" && transientProviderFailure(error));
    if (!retry || workSignal.aborted || Date.now() - startTime > RETRY_BEFORE_MS) throw error;
    const firstUsage = selectObservedUsage(error as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }, false)
      ?? missingOpenRouterUsage("sparring_attempt");
    console.warn(`[SPARRING] ${action} attempt failed (${error instanceof Error ? error.name : "unknown"}); trying once more`);
    // The first attempt's draft is void; the answer is written again.
    ctx.stream?.reset();
    try {
      answered = await attempt(wrongShape ? error.path : undefined, firstUsage);
    } catch (retryError) {
      // Bill the first attempt with whatever the second one cost. A shape
      // failure already carries both.
      if (retryError && typeof retryError === "object" && !(retryError instanceof AIResponseValidationError)) {
        const withUsage = retryError as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage };
        withUsage.usage = mergeNormalizedUsage([firstUsage, withUsage.usage ?? missingOpenRouterUsage("sparring_retry")]);
        withUsage.completedUsage = mergeNormalizedUsage([firstUsage, withUsage.completedUsage]);
      }
      throw retryError;
    }
  }
  const aiResult = answered.result;
  const parsedOutput = answered.parsed;

  // In a voice round the speech may carry audio tags. They go to the voice
  // only: the content that is shown, signed, and saved has none.
  let voice: VoicePayload | undefined;
  if (parsedOutput.action === "respond" && ctx.voice) {
    const reply = await prepareVoiceReply(userId, feature, parsedOutput.speech.content);
    if (!reply.clean) throw new AIResponseValidationError("speech.content", aiResult.usage);
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
    await options.notifyScored?.(userId, sparringRequest.sessionId);
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
