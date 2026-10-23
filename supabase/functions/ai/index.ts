// Supabase Edge Function: AI proxy for DebateLab.
// Keeps provider keys server-side and returns structured JSON. This file is
// the HTTP entrypoint and dispatcher: it authenticates, validates, checks
// entitlements, routes the model, ranks sources, and accounts for usage once,
// then hands the request to one focused handler per feature in ./features/.

import { buildUserPrompt } from "./prompt-builder.ts";
import { validateControlInput } from "../_shared/control-enforcement.ts";
import {
  boundPromptSources,
  buildSystemPrompt,
  type Feature,
  FEATURE_PROMPTS,
  MAX_PROMPT_SOURCE_COUNT,
  type PromptSource,
} from "../_shared/prompts.ts";
import {
  claimSparringScoreSession,
  parseSparringRequest,
  releaseSparringScoreClaim,
  verifySparringTranscriptIntegrity,
  type SparringRequest,
} from "./sparring-persistence.ts";
import {
  chargedAgainstCap,
  excludeFromCap,
  mergeNormalizedUsage,
  selectObservedUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import {
  BACKGROUND_MODEL,
  BACKGROUND_REASONING_EFFORT,
  DEFAULT_MODEL,
  effectiveReasoningEffort,
  isModelSelection,
  isReasoningEffort,
  retiredModelSuccessor,
  type ModelCatalogEntry,
  type ModelSelection,
} from "../_shared/model-catalog.ts";
import { resolveModelSelection } from "../_shared/auto-model-router.ts";
import { JEV_MODEL } from "../_shared/jev.ts";
import {
  rankSourcesForRequest,
  type SourceAssessment,
  type SourceDecisionCandidate,
} from "../_shared/source-decisions.ts";
import { evaluateCrossfireExchange } from "../_shared/crossfire-signals.ts";
import {
  type Provider,
  type ResearchContext,
  type ResearchDeps,
} from "../_shared/research.ts";
import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  checkRateLimit,
  checkUserBanned,
  logUsage,
  parseQuotaSessionKey,
  peekRateLimit,
  type QuotaSession,
  type RateLimitResult,
  refundQuotaReservation,
} from "../_shared/entitlements.ts";
import { REFUND_MAX_DELIVERED_CHARS } from "../_shared/usage-limits.ts";
import {
  CLAUDE_UNAVAILABLE_CODE,
  CLAUDE_UNAVAILABLE_MESSAGE,
  CLAUDE_UNAVAILABLE_STATUS,
  ClaudeProviderUnavailableError,
} from "../_shared/provider-routing.ts";
import { isWorkspaceMember, loadAuthorizedWorkspaceContext } from "../_shared/workspace-context.ts";
import { type DebateContextRequest, parseDebateContextRequest } from "../_shared/debate-context.ts";
import {
  type DebateContextDatabase,
  debateContextMeta,
  DebateContextNotFoundError,
  debatePromptContextFor,
  type LoadedDebateContext,
  loadDebateContext,
} from "../_shared/debate-context-loader.ts";
import {
  badRequest,
  generateRequestId,
  getGlobalPrompt,
  log,
  narrowSparringDatabase,
  sparringSupabase,
  supabase,
  supabaseServiceKey,
  sparringIntegritySecret,
  workspaceDatabase,
} from "./runtime.ts";
import {
  type AIResult,
  AIResponseValidationError,
  callAI,
  createRequestBudgetSignal,
  type GenerationStream,
  InvalidJsonResponseError,
  isIncompleteProviderStream,
  modelForRequest,
  OPENROUTER_PROVIDER,
  REQUEST_BUDGET_MS,
} from "./provider.ts";
import { streamFeatureResponse } from "./stream.ts";
import { createRunResultRecorder, parseResultKey, type RunResultsDatabase } from "./run-results.ts";
import { workerTimeLeft } from "../_shared/background.ts";
import {
  isRecord,
  MAX_REQUEST_BODY_BYTES,
  parsePersonalSourceIds,
  readBoundedJsonBody,
  RequestBodyTooLargeError,
  sanitizeInput,
} from "./request.ts";
import { cleanGeneratedText, getCurrentDateContext } from "./text.ts";
import {
  boundCrossfireSources,
  claimCrossfireSignalToken,
  type CrossfireInput,
  validateCrossfireInput,
  verifyCrossfireSignalToken,
} from "./features/crossfire-input.ts";
import { hasResearch, type FeatureContext } from "./features/types.ts";
import { handleAsk } from "./features/ask.ts";
import { handleAttack } from "./features/attack.ts";
import { handleBrainstorm } from "./features/brainstorm.ts";
import { handleCrossfire } from "./features/crossfire.ts";
import { handleFactoids } from "./features/factoids.ts";
import { handleGenerate } from "./features/generate.ts";
import { handleSparring } from "./features/sparring.ts";

export { createRequestBudgetSignal, MAX_REQUEST_BODY_BYTES };
export {
  MAX_CROSSFIRE_ARGUMENT_CHARS,
  MAX_CROSSFIRE_PROMPT_CHARS,
  MAX_CROSSFIRE_RESOLUTION_CHARS,
  MAX_CROSSFIRE_SEED_QUESTIONS,
  MAX_CROSSFIRE_TRANSCRIPT_CHARS,
  MAX_CROSSFIRE_TRANSCRIPT_TURNS,
  MAX_CROSSFIRE_TURN_CHARS,
} from "./features/crossfire-input.ts";

// A streamed run that has not answered this long after its request arrived
// is answered with a timeout: past the provider budget, before Supabase's
// 150 s wall clock cuts the connection.
const STREAM_DEADLINE_MS = REQUEST_BUDGET_MS + 12_000;

export async function handleRequest(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const receivedAt = Date.now();
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
  // Require a valid user session for all AI requests.
  // The frontend already enforces auth; this protects the endpoint even when
  // gateway JWT verification is disabled.
  let userId: string;
  try {
    userId = (await requireUser(req)).user.id;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return jsonError(error, corsHeaders);
  }
  log(requestId, "INFO", "User authenticated", { userId });

  // A streamed response ends early when the browser cancels it; provider
  // work stops with it, as it does when a plain request is aborted.
  const streamCancel = new AbortController();
  const workSignal = createRequestBudgetSignal(AbortSignal.any([req.signal, streamCancel.signal]));
  let body: Record<string, unknown>;
  try {
    const parsedBody = await readBoundedJsonBody(req);
    if (!isRecord(parsedBody)) throw new Error("JSON body must be an object");
    body = parsedBody;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      log(requestId, "WARN", "Request body exceeded byte limit");
      return badRequest(error.message, corsHeaders, 413);
    }
    log(requestId, "WARN", "Invalid JSON body received");
    return badRequest("Invalid JSON body", corsHeaders);
  }
  if (typeof body.feature !== "string" || !Object.hasOwn(FEATURE_PROMPTS, body.feature)) {
    return badRequest("Unsupported feature", corsHeaders);
  }
  const feature = body.feature as Feature;
  const rawInput = body.input;
  const sentModel = (typeof body.model === "string" ? body.model : "") || DEFAULT_MODEL;
  const rawModel = retiredModelSuccessor(sentModel) ?? sentModel;
  if (!isModelSelection(rawModel)) {
    log(requestId, "WARN", "Rejected unsupported model/provider combination", { model: rawModel.slice(0, 100) });
    return badRequest("Unsupported model or provider combination", corsHeaders);
  }
  const requestedModel: ModelSelection = rawModel;
  // A read-only quota check: what a new round on this model costs and whether
  // it fits today. Crossfire and Sparring ask before starting a round, so the
  // clock never starts on one the server would refuse. Reserves nothing.
  if (body.quotaCheck === true) {
    const quota = await peekRateLimit(userId, requestedModel);
    if (quota.statusCode === 500) return badRequest("Unable to verify your quota", corsHeaders, 500);
    return new Response(JSON.stringify({
      quota: { allowed: quota.allowed, code: quota.code, limit: quota.limit, current: quota.current, units: quota.units },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  let model = DEFAULT_MODEL as string;
  let modelEntry: ModelCatalogEntry = modelForRequest(DEFAULT_MODEL);
  let resolvedModelMeta: string | undefined;
  const provider: Provider = OPENROUTER_PROVIDER;
  const requestedReasoningEffort = body.reasoningEffort === undefined
    ? undefined
    : isReasoningEffort(body.reasoningEffort) ? body.reasoningEffort : null;
  if (requestedReasoningEffort === null) return badRequest("Invalid reasoning effort", corsHeaders);
  // A voice round. It sits beside `input` so servers from before voice ignore it.
  const voiceRequested = body.voice === true;
  // Live generation: answer with Server-Sent Events (see stream.ts). Older
  // servers ignore the flag and answer with JSON, which clients also accept.
  const streamRequested = body.stream === true;
  // The browser's id for a streamed run. With it the final result is kept in
  // ai_run_results, so a browser that loses the stream can still read it.
  // Older clients send none and stream as before.
  const resultKey = streamRequested ? parseResultKey(body.resultKey) : null;
  // The per-user custom system prompt was replaced by each Current Debate's
  // settings and instructions. A customSystemPrompt field from an older
  // client is ignored.
  let rawSources = body.sources;
  const sourceIdsResult = parsePersonalSourceIds(body.sourceIds);
  if ("error" in sourceIdsResult) return badRequest(sourceIdsResult.error, corsHeaders);
  if (sourceIdsResult.value !== undefined && body.sources !== undefined) {
    return badRequest("Send sourceIds instead of source content", corsHeaders);
  }
  // Current Debate context arrives as IDs only. When present it replaces the
  // legacy sourceIds field, which clients also send for older servers.
  let debateContextRequest: DebateContextRequest | undefined;
  if (body.debateContext !== undefined && body.debateContext !== null) {
    const parsedDebateContext = parseDebateContextRequest(body.debateContext);
    if ("error" in parsedDebateContext) return badRequest(parsedDebateContext.error, corsHeaders);
    if (body.workspaceContext !== undefined) {
      return badRequest("Debate context cannot be mixed with workspace context", corsHeaders);
    }
    if (body.sources !== undefined) return badRequest("Send debate source IDs instead of source content", corsHeaders);
    debateContextRequest = parsedDebateContext.value;
  }

  // Log incoming request
  log(requestId, "INFO", "Request received", {
    feature,
    provider,
    model: requestedModel,
    sourcesCount: debateContextRequest?.sourceIds.length ?? sourceIdsResult.value?.length ?? (Array.isArray(rawSources) ? rawSources.length : 0),
    debateContext: Boolean(debateContextRequest),
  });

  if (!isRecord(rawInput)) return badRequest("Missing input", corsHeaders);

  let input: Record<string, unknown> = rawInput;
  let crossfireInput: CrossfireInput | undefined;
  let crossfireSources: PromptSource[] = [];
  let crossfireSourcesTruncated = false;
  if (feature === "crossfire") {
    const crossfireResult = validateCrossfireInput(rawInput);
    if ("error" in crossfireResult) {
      log(requestId, "WARN", "Crossfire input validation failed", { reason: crossfireResult.error });
      return badRequest(crossfireResult.error, corsHeaders);
    }
    crossfireInput = crossfireResult.value;
    input = crossfireInput as unknown as Record<string, unknown>;
  }
  const sanitizeResult = sanitizeInput(input);
  if ("rejected" in sanitizeResult) {
    log(requestId, "WARN", "Request rejected by sanitization", { reason: sanitizeResult.rejected });
    return badRequest(sanitizeResult.rejected, corsHeaders);
  }
  const sanitizedInput = sanitizeResult.sanitized;
  const controlError = validateControlInput(feature, sanitizedInput);
  if (controlError) {
    log(requestId, "WARN", "AI control validation failed", { reason: controlError });
    return badRequest(controlError, corsHeaders);
  }
  let responseTruncated = sanitizeResult.truncated || crossfireSourcesTruncated;
  let sources: PromptSource[] = feature === "crossfire"
    ? crossfireSources
    : Array.isArray(rawSources) ? rawSources as PromptSource[] : [];
  let validatedSparringRequest: SparringRequest | undefined;
  if (feature === "sparring") {
    const sparringResult = parseSparringRequest(sanitizedInput);
    if ("error" in sparringResult) {
      log(requestId, "WARN", "Invalid sparring request", { reason: sparringResult.error });
      return badRequest(sparringResult.error, corsHeaders);
    }
    validatedSparringRequest = sparringResult.request;
  }
  // Crossfire and Sparring are charged once per round (SESSION_QUOTA). A
  // Sparring round is named by its validated sessionId. Crossfire sends its
  // round id beside `input`, so servers from before session charging ignore
  // it; a Crossfire request without one is charged per call.
  let quotaSession: QuotaSession | undefined;
  if (validatedSparringRequest) {
    quotaSession = { feature: "sparring", key: validatedSparringRequest.sessionId };
  } else if (crossfireInput && body.quotaSession !== undefined) {
    const key = parseQuotaSessionKey(body.quotaSession);
    if (!key) return badRequest("Invalid quota session", corsHeaders);
    quotaSession = { feature: "crossfire", key };
  }
  let sourceAssessments: SourceAssessment[] = [];
  let workspaceAccess: {
    meta: Record<string, unknown>;
    requestId: string;
    threadId: string | null;
    threadRequest: { assistantMessageId: string; userMessageId: string } | null;
    workspaceId: string;
  } | null = null;
  let workspaceThreadSettled = false;
  // The answer reached storage (a workspace thread reply or a Sparring
  // scorecard), so a later failure still leaves the student something.
  let outputSaved = false;
  let loadedDebate: LoadedDebateContext | null = null;
  let debateSourceCounts = { omittedForSize: 0, shortened: 0 };
  const successBody = async (payload: Record<string, unknown>) => {
    if (workspaceAccess && !await isWorkspaceMember(workspaceDatabase, userId, workspaceAccess.workspaceId)) {
      throw new Error("Workspace access revoked");
    }
    if (workspaceAccess?.threadId && workspaceAccess.threadRequest && !workspaceThreadSettled) {
      const output = payload.output && typeof payload.output === "object" ? payload.output as Record<string, unknown> : null;
      if (typeof output?.response !== "string") throw new Error("Workspace thread response unavailable");
      const settled = await supabase.rpc("complete_workspace_thread_generation", {
        p_content: output.response,
        p_request_id: workspaceAccess.requestId,
        p_status: "complete",
        p_thread_id: workspaceAccess.threadId,
        p_user_id: userId,
        p_workspace_id: workspaceAccess.workspaceId,
      });
      if (settled.error) throw new Error("Workspace thread response unavailable");
      workspaceThreadSettled = true;
      outputSaved = true;
    }
    const meta = {
      ...(responseTruncated ? { truncated: true } : {}),
      ...(resolvedModelMeta ? { requestedModel, resolvedModel: resolvedModelMeta } : {}),
      ...(workspaceAccess ? { workspaceContext: workspaceAccess.meta } : {}),
      ...(loadedDebate ? { debateContext: debateContextMeta(loadedDebate, feature, sources.length, debateSourceCounts, validatedSparringRequest?.action) } : {}),
    };
    const enriched = sourceAssessments.length > 0 ? { ...payload, sourceAssessments } : payload;
    return Object.keys(meta).length > 0 ? { ...enriched, meta } : enriched;
  };

  if (debateContextRequest) {
    try {
      loadedDebate = await loadDebateContext(supabase as unknown as DebateContextDatabase, userId, debateContextRequest);
    } catch (error) {
      if (error instanceof DebateContextNotFoundError) {
        log(requestId, "WARN", "Rejected debate context for a debate the caller does not own");
        return badRequest("Debate not found", corsHeaders, 404);
      }
      log(requestId, "ERROR", "Unable to load debate context", { error: error instanceof Error ? error.message : "Unknown error" });
      return badRequest("Unable to load debate context", corsHeaders, 500);
    }
    // A live sparring round stays transcript-only: no Library evidence.
    const debateSources = feature === "sparring" ? [] : loadedDebate.sources;
    const bounded = boundPromptSources(debateSources);
    debateSourceCounts = {
      omittedForSize: debateSources.length - bounded.length,
      shortened: bounded.filter((source, index) => source.content.length < debateSources[index].content.length).length,
    };
    rawSources = bounded.map((source, index) => ({
      ...source,
      id: debateSources[index].id,
      ...(debateSources[index].metadata ? { metadata: debateSources[index].metadata } : {}),
    }));
    sources = bounded;
  } else if (sourceIdsResult.value !== undefined) {
    if (body.workspaceContext !== undefined && sourceIdsResult.value.length > 0) {
      return badRequest("Personal sources cannot be mixed with workspace context", corsHeaders);
    }
    if (sourceIdsResult.value.length === 0) {
      rawSources = [];
      sources = [];
    } else {
      const { data, error } = await supabase
        .from("sources")
        .select("id,title,content,origin,type,metadata")
        .eq("user_id", userId)
        .eq("is_active", true)
        .in("id", sourceIdsResult.value);
      if (error) {
        log(requestId, "ERROR", "Unable to load personal sources", { error: error.message });
        return badRequest("Unable to load source library", corsHeaders, 500);
      }
      const rows = Array.isArray(data) ? data.filter(isRecord) : [];
      const rowById = new Map(rows.map((row) => [String(row.id), row]));
      const orderedRows = sourceIdsResult.value.flatMap((id) => {
        const row = rowById.get(id);
        if (!row || typeof row.title !== "string" || !row.title.trim() || typeof row.content !== "string" || !row.content || typeof row.type !== "string" || !row.type.trim()) return [];
        return [row];
      });
      const bounded = boundPromptSources(orderedRows);
      rawSources = bounded.flatMap((source, index) => {
        const row = orderedRows[index];
        return row ? [{
          ...source,
          id: String(row.id),
          ...(isRecord(row.metadata) ? { metadata: row.metadata } : {}),
        }] : [];
      });
      sources = bounded;
    }
  }

  if (crossfireInput?.operation === "signal") {
    if (await checkUserBanned(userId)) return badRequest("Your account has been suspended. Please contact support.", corsHeaders, 403);
    if (!(await verifyCrossfireSignalToken(userId, crossfireInput))) return badRequest("Invalid or expired Crossfire signal token", corsHeaders, 403);
    try {
      // A token-specific counter atomically bounds replays without consuming the product's AI quota.
      if (!(await claimCrossfireSignalToken(userId, crossfireInput))) {
        return badRequest("Crossfire signal token has already been used", corsHeaders, 409);
      }
    } catch (error) {
      log(requestId, "ERROR", "Crossfire signal token claim failed", { error: error instanceof Error ? error.message : "Unknown error" });
      return badRequest("Unable to verify Crossfire signal token", corsHeaders, 500);
    }
    const evaluated = await evaluateCrossfireExchange({
      transcript: crossfireInput.transcript,
      reply: crossfireInput.reply,
      signal: workSignal,
    });
    const signalUsage = evaluated.jev?.usage ?? evaluated.jevUsage;
    if (signalUsage) await logUsage(userId, "jev_crossfire_signal", provider, JEV_MODEL, signalUsage, undefined, evaluated.jevUsage ? "error" : "success", evaluated.jevUsage ? "jev_incomplete" : undefined);
    return new Response(JSON.stringify(await successBody({ output: evaluated.signal ? { signal: evaluated.signal } : {} })), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (feature === "crossfire" && crossfireInput) {
    const sourcesResult = boundCrossfireSources(rawSources, crossfireInput.config.useSourceLibrary);
    if ("error" in sourcesResult) {
      log(requestId, "WARN", "Crossfire source validation failed", { reason: sourcesResult.error });
      return badRequest(sourcesResult.error, corsHeaders);
    }
    crossfireSources = sourcesResult.value;
    crossfireSourcesTruncated = sourcesResult.truncated;
    sources = crossfireSources;
    responseTruncated = responseTruncated || crossfireSourcesTruncated;
  }

  if (body.workspaceContext !== undefined) {
    try {
      const loaded = await loadAuthorizedWorkspaceContext(workspaceDatabase, userId, body.workspaceContext);
      workspaceAccess = {
        meta: loaded.meta,
        requestId: loaded.input.requestId,
        threadId: loaded.input.threadId,
        threadRequest: loaded.input.threadRequest,
        workspaceId: loaded.input.workspaceId,
      };
      sources = boundPromptSources([{
        title: "Authorized workspace context",
        content: loaded.context,
        type: "workspace",
      }]);
      if (loaded.input.threadRequest) {
        const threadMessage = sanitizedInput && typeof sanitizedInput === "object"
          ? (sanitizedInput as Record<string, unknown>).message
          : null;
        if (feature !== "ask" || !loaded.input.threadId || typeof threadMessage !== "string") {
          return badRequest("Workspace unavailable", corsHeaders, 403);
        }
      }
    } catch {
      return badRequest("Workspace unavailable", corsHeaders, 403);
    }
  }
  const interruptWorkspaceThread = async () => {
    if (!workspaceAccess?.threadId || !workspaceAccess.threadRequest || workspaceThreadSettled) return;
    await supabase.rpc("complete_workspace_thread_generation", {
      p_content: "Generation interrupted",
      p_request_id: workspaceAccess.requestId,
      p_status: "interrupted",
      p_thread_id: workspaceAccess.threadId,
      p_user_id: userId,
      p_workspace_id: workspaceAccess.workspaceId,
    });
    workspaceThreadSettled = true;
  };
  if (workspaceAccess?.threadRequest && workspaceAccess.threadId) {
    const threadMessage = (sanitizedInput as Record<string, unknown>).message;
    const started = await supabase.rpc("start_workspace_thread_generation", {
      p_assistant_message_id: workspaceAccess.threadRequest.assistantMessageId,
      p_content: threadMessage,
      p_request_id: workspaceAccess.requestId,
      p_thread_id: workspaceAccess.threadId,
      p_user_id: userId,
      p_user_message_id: workspaceAccess.threadRequest.userMessageId,
      p_workspace_id: workspaceAccess.workspaceId,
    });
    const claim = started.data && typeof started.data === "object" ? started.data as Record<string, unknown> : null;
    if (started.error || !claim) return badRequest("Workspace thread unavailable", corsHeaders, 409);
    if (claim.claimed !== true) {
      workspaceThreadSettled = true;
      if (claim.status === "complete" && typeof claim.content === "string") {
        return new Response(JSON.stringify(await successBody({
          output: { response: claim.content, followUpQuestions: [], uncertainties: [] },
        })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return badRequest("Workspace thread generation is already in progress", corsHeaders, 409);
    }
  }
  const sparringDatabase = narrowSparringDatabase(sparringSupabase);
  let sparringScoreClaimed = false;
  let sparringScoreClaimToken: string | undefined;

  if (validatedSparringRequest && !(await verifySparringTranscriptIntegrity(
    validatedSparringRequest,
    userId,
    [sparringIntegritySecret, supabaseServiceKey],
  ))) {
    log(requestId, "WARN", "Rejected sparring transcript with invalid AI-turn integrity");
    return badRequest("Sparring transcript integrity check failed", corsHeaders);
  }

  // Claim a score session before reserving quota or calling a provider. This
  // makes concurrent retries converge and prevents cross-user UUID overwrite.
  if (validatedSparringRequest?.action === "score") {
    let claim: Awaited<ReturnType<typeof claimSparringScoreSession>>;
    try {
      claim = await claimSparringScoreSession(sparringDatabase, validatedSparringRequest, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Score claim failed";
      log(requestId, "ERROR", "Unable to claim sparring score", { error: message });
      return new Response(JSON.stringify({ error: "Unable to start sparring score" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claim.status === "complete") {
      return new Response(JSON.stringify(await successBody({
        output: { action: "score", scorecard: claim.scorecard },
        sessionId: validatedSparringRequest.sessionId,
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (claim.status === "conflict") {
      return new Response(JSON.stringify({ error: "Sparring session ID is already in use" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claim.status === "in_progress") {
      return new Response(JSON.stringify({ error: "Sparring score is already in progress", code: "score_in_progress" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claim.status === "cleared") {
      return new Response(JSON.stringify({ error: "This score request began before your data was cleared", code: "data_cleared" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    sparringScoreClaimed = true;
    sparringScoreClaimToken = claim.token;
  }

  // Check rate limits (includes subscription gating and model access)
  let rateLimit: RateLimitResult;
  try {
    rateLimit = await checkRateLimit(userId, requestedModel, quotaSession);
  } catch (error) {
    await interruptWorkspaceThread();
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
    }
    const message = error instanceof Error ? error.message : "Rate-limit check failed";
    log(requestId, "ERROR", "Rate-limit check failed", { error: message });
    return new Response(JSON.stringify({ error: "Unable to verify request limits" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!rateLimit.allowed) {
    await interruptWorkspaceThread();
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
      sparringScoreClaimed = false;
    }
    await logUsage(userId, feature, provider, requestedModel, undefined, undefined, "rate_limited", rateLimit.code);
    return new Response(JSON.stringify({
      error: rateLimit.reason,
      code: rateLimit.code,
      limit: rateLimit.limit,
      current: rateLimit.current,
      units: rateLimit.units,
    }), {
      status: rateLimit.statusCode || 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Every path that gives the units back goes through this, so a run is
  // refunded at most once, however its failure is reached.
  const reservation = rateLimit;
  let refund: Promise<boolean> | undefined;
  const refundOnce = () => refund ??= refundQuotaReservation(userId, reservation);

  const routingStartedAt = Date.now();
  try {
    const resolution = await resolveModelSelection({
      requestedModel,
      feature,
      input: sanitizedInput,
      canAccessProModels: Boolean(rateLimit.canAccessProModels),
      reasoningEffort: requestedReasoningEffort,
      sourceCount: Array.isArray(rawSources) ? rawSources.length : 0,
      signal: workSignal,
    });
    model = resolution.resolvedModel;
    modelEntry = resolution.modelEntry;
    resolvedModelMeta = model;
    const routingUsage = resolution.jev?.usage ?? resolution.jevUsage;
    if (routingUsage) {
      await logUsage(userId, "jev_model_router", provider, JEV_MODEL, routingUsage, Date.now() - routingStartedAt, resolution.jevUsage ? "error" : "success", resolution.jevUsage ? "jev_incomplete" : undefined);
    }
  } catch (error) {
    await interruptWorkspaceThread();
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
      sparringScoreClaimed = false;
    }
    const message = error instanceof Error ? error.message : "Model routing failed";
    log(requestId, "ERROR", "Model routing failed", { error: message });
    // Nothing ran, so nothing is charged.
    await refundOnce();
    await logUsage(userId, feature, provider, requestedModel, undefined, undefined, "error", "routing_failed");
    return badRequest(message.includes("Pro") ? message : "Unable to route this request", corsHeaders, message.includes("Pro") ? 403 : 500);
  }

  const sourceDecisionCandidates = Array.isArray(rawSources)
    ? rawSources.slice(0, MAX_PROMPT_SOURCE_COUNT).flatMap((value, index): SourceDecisionCandidate[] => {
      if (!isRecord(value) || typeof value.title !== "string" || typeof value.content !== "string" || typeof value.type !== "string") return [];
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const id = typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 128) : undefined;
      const origin = typeof value.origin === "string" && value.origin.trim() ? value.origin.trim().slice(0, 500) : undefined;
      const qualityLabel = metadata.qualityLabel === "strong" || metadata.qualityLabel === "moderate" || metadata.qualityLabel === "weak"
        ? metadata.qualityLabel
        : undefined;
      const qualityScore = typeof metadata.qualityScore === "number" && Number.isFinite(metadata.qualityScore)
        ? metadata.qualityScore
        : undefined;
      return [{
        key: id ?? origin ?? `source-${index}`,
        ...(id ? { id } : {}),
        title: value.title,
        content: value.content,
        ...(origin ? { origin } : {}),
        type: value.type,
        ...(qualityLabel ? { qualityLabel } : {}),
        ...(qualityScore !== undefined ? { qualityScore } : {}),
      }];
    })
    : [];
  if (feature !== "sparring" && feature !== "crossfire" && sourceDecisionCandidates.length > 0) {
    try {
      const ranked = await rankSourcesForRequest({
        feature,
        requestText: JSON.stringify(sanitizedInput),
        sources: sourceDecisionCandidates,
        signal: workSignal,
      });
      sourceAssessments = ranked.assessments;
      sources = ranked.sources.map(({ title, content, origin, type }) => ({ title, content, ...(origin ? { origin } : {}), type }));
      const rankingUsage = ranked.jev?.usage ?? ranked.jevUsage;
      if (rankingUsage) await logUsage(userId, "jev_source_ranking", provider, JEV_MODEL, rankingUsage, undefined, ranked.jevUsage ? "error" : "success", ranked.jevUsage ? "jev_incomplete" : undefined);
    } catch {
      await interruptWorkspaceThread();
      await refundOnce();
      await logUsage(userId, feature, provider, model, undefined, undefined, "error", "source_ranking_failed");
      return badRequest("Unable to rank sources", corsHeaders, 500);
    }
  }

  const reasoningEffort = effectiveReasoningEffort(model, requestedReasoningEffort ?? undefined, Boolean(rateLimit.canAccessProModels));
  log(requestId, "INFO", "Resolved model controls", {
    model: modelEntry.id,
    requestedReasoningEffort: requestedReasoningEffort ?? "medium",
    reasoningEffort,
  });

  const startTime = Date.now();
  // Usage from research sub-calls (search decision, follow-up queries, Exa
  // searches and page reads) is collected here so the parent request's row
  // accounts for every token and every paid call.
  const researchUsage: NormalizedUsage[] = [];
  let researchAccountingIncomplete = false;
  // A research step that finished, or failed after paid work. Claude refusing
  // a research step outright (the same outage as the main call) does not count.
  let researchDidWork = false;
  // Research sub-calls are small background steps, so they use the fixed
  // cheap model instead of the user's choice.
  const researchDeps: ResearchDeps = {
    provider,
    model: BACKGROUND_MODEL,
    reasoningEffort: BACKGROUND_REASONING_EFFORT,
    signal: workSignal,
    onTimeout: () => {
      researchAccountingIncomplete = true;
    },
    onExaUsage: (usage) => {
      researchUsage.push(usage);
    },
    callModel: async (args) => {
      try {
        const result = await callAI(args.provider, args.model, args.systemPrompt, args.messages, args.reasoningEffort, "research", args.signal, undefined, args.outputSchema);
        // A provider that ignores cancellation must not append usage after the
        // research timeout has already been finalized by the parent request.
        if (result.usage && !args.signal?.aborted) researchUsage.push(result.usage);
        researchDidWork = true;
        return { output: result.output };
      } catch (err) {
        const usageError = err && typeof err === "object"
          ? err as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }
          : undefined;
        const researchErrorUsage = selectObservedUsage(usageError, args.signal?.aborted === true);
        if (researchErrorUsage) researchUsage.push(researchErrorUsage);
        const refusedForFree = err instanceof ClaudeProviderUnavailableError && !err.afterOutput &&
          !usageError?.completedUsage && !chargedAgainstCap(researchErrorUsage);
        if (!refusedForFree) researchDidWork = true;
        throw err;
      }
    },
  };
  const researchUsageForLog = (): NormalizedUsage[] => [
    ...researchUsage.splice(0),
    ...(researchAccountingIncomplete ? [{ incomplete: true }] : []),
  ];
  // Keep the completed main provider call available if post-processing fails
  // before the normal success-path usage log runs.
  let completedMainUsage: NormalizedUsage | undefined;
  const recordMainResult = (result: AIResult): AIResult => {
    completedMainUsage = result.usage;
    return result;
  };
  // Layered system prompt: identity + task + JSON rules (+ admin/custom/knowledge).
  // Citation-honesty rules are added only when a feature actually obtained web
  // research, never on the promise of it.
  const buildSystemPromptFor = async (feature: Feature, research?: ResearchContext | null, promptSources = sources) =>
    buildSystemPrompt({
      feature,
      dateContext: getCurrentDateContext(),
      globalPrompt: await getGlobalPrompt(feature),
      debateContext: debatePromptContextFor(loadedDebate, feature, validatedSparringRequest?.action),
      sparringVoice: validatedSparringRequest
        ? {
          spokenReplies: voiceRequested && validatedSparringRequest.action === "respond",
          measuredDelivery: validatedSparringRequest.action === "score" &&
            validatedSparringRequest.speeches.some((speech) => speech.delivery !== undefined),
        }
        : undefined,
      // Sparring is transcript-only. Do not let unrelated saved evidence alter
      // an opponent response or a judge's scorecard.
      sources: feature === "sparring" && !workspaceAccess ? [] : promptSources,
      researchContext: hasResearch(research)
        ? "WEB RESEARCH RESULTS are attached to this request."
        : undefined,
    });
  // Characters of model text streamed to the browser. A reset does not take
  // any back: the student has already read them.
  let deliveredChars = 0;
  // The streamed answer on screen is complete: the model sent its
  // finish_reason. A repair retry's reset voids it.
  let modelFinished = false;
  // The handler wrote this run's ai_requests row. Every handler logs it right
  // before ctx.respond, so a failure after that must not log a second one.
  let usageLogged = false;
  const countDelivered = (stream?: GenerationStream): GenerationStream | undefined => stream && {
    ...stream,
    delta: (text) => {
      deliveredChars += text.length;
      stream.delta(text);
    },
    reset: () => {
      modelFinished = false;
      stream.reset();
    },
    finished: () => {
      modelFinished = true;
      stream.finished?.();
    },
  };
  const runFeature = async (sink?: GenerationStream): Promise<Response> => {
    const stream = countDelivered(sink);
    try {
      const ctx: FeatureContext = {
        req,
        userId,
        provider,
        model,
        reasoningEffort,
        workSignal,
        voice: voiceRequested,
        stream,
        input: sanitizedInput,
        sources,
        sourceAssessments,
        sourceDecisionCandidates,
        researchDeps,
        startTime,
        researchUsageForLog,
        recordMainResult,
        buildSystemPromptFor,
        markTruncated: () => {
          responseTruncated = true;
        },
        respond: async (payload) => {
          usageLogged = true;
          return new Response(JSON.stringify(await successBody(payload)), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        },
      };

      switch (feature) {
        case "sparring":
          return await handleSparring(ctx, {
            request: validatedSparringRequest,
            database: sparringDatabase,
            claimToken: sparringScoreClaimToken,
            onScoreSaved: () => {
              sparringScoreClaimed = false;
              outputSaved = true;
            },
          });
        case "crossfire":
          return await handleCrossfire(ctx, {
            input: crossfireInput,
            sources: crossfireSources,
            workspaceSources: workspaceAccess ? sources : null,
            debateContext: debatePromptContextFor(loadedDebate, feature),
            onOutputsOmittedForSize: () => {
              if (!loadedDebate) return;
              loadedDebate = {
                ...loadedDebate,
                outputs: [],
                outputsOmittedForSize: [
                  ...loadedDebate.outputs.map(({ kind, id }) => ({ kind, id })),
                  ...loadedDebate.outputsOmittedForSize,
                ],
              };
            },
          });
        case "factoids":
          return await handleFactoids(ctx);
        case "ask":
          return await handleAsk(ctx);
        case "generate":
          return await handleGenerate(ctx);
        case "brainstorm":
          return await handleBrainstorm(ctx);
        case "attack":
          return await handleAttack(ctx);
      }

      // Fallback for any other feature. Without its own cap it gets the
      // largest one, a full case.
      const systemPrompt = await buildSystemPromptFor(feature);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, "");
      const messages = [{ role: "user", content: userPrompt }];
      const fallbackResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, reasoningEffort, "generate", workSignal, stream));
      const output = cleanGeneratedText(fallbackResult.output);

      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([fallbackResult.usage, ...researchUsageForLog()]), latencyMs);
      usageLogged = true;
      return new Response(JSON.stringify(await successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[ERROR]", message.slice(0, 2000));

      if (workspaceAccess?.threadId && workspaceAccess.threadRequest && !workspaceThreadSettled) {
        await supabase.rpc("complete_workspace_thread_generation", {
          p_content: "Generation interrupted",
          p_request_id: workspaceAccess.requestId,
          p_status: "interrupted",
          p_thread_id: workspaceAccess.threadId,
          p_user_id: userId,
          p_workspace_id: workspaceAccess.workspaceId,
        });
        workspaceThreadSettled = true;
      }

      if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
        await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
        sparringScoreClaimed = false;
      }

      // Log error
      const latencyMs = Date.now() - startTime;
      const usageError = err && typeof err === "object"
        ? err as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }
        : undefined;
      // A successful main call takes precedence over usage attached to a later
      // post-processing error. This avoids counting its repair attempts twice.
      const mainErrorUsage = completedMainUsage ?? selectObservedUsage(usageError, workSignal?.aborted === true);
      // Claude runs only on the Anthropic key, with no fallback provider. When
      // it fails the student gets an outage message.
      const claudeUnavailable = err instanceof ClaudeProviderUnavailableError;
      // The model answered, but not in a usable shape even after its repair
      // retry. Not a provider outage: logged and answered as invalid_output.
      const invalidOutput = err instanceof AIResponseValidationError || err instanceof InvalidJsonResponseError;
      const aborted = workSignal?.aborted === true;
      const timedOut = aborted && (workSignal.reason as { name?: unknown } | undefined)?.name === "TimeoutError";
      const errorUsage = mergeNormalizedUsage([
        mainErrorUsage,
        ...researchUsageForLog(),
      ]);
      // A run that failed on the server costs nothing, however much of it had
      // streamed: a provider failure, a reply cut off at its cap, a response
      // that failed validation, or the request budget running out. The
      // student sees an error instead of the answer. A run the browser left
      // (reload, closed tab, Stop, a dropped connection; the server cannot
      // tell these apart) is refunded only before the student saw a usable
      // part of the answer: one that streamed REFUND_MAX_DELIVERED_CHARS or
      // more, or whose answer the model had finished, stays charged, as does
      // a non-streamed call the browser left after the provider answered.
      // Otherwise a student could read most of a case and press Stop to get
      // the unit back. A run whose answer was saved always stays charged.
      const clientLeft = aborted && !timedOut;
      const answerKept = clientLeft && (modelFinished || Boolean(completedMainUsage) || deliveredChars >= REFUND_MAX_DELIVERED_CHARS);
      const refundable = !outputSaved && !answerKept;
      // Refund before answering, so a retry sent straight away sees it.
      const refunded = refundable && await refundOnce();
      // The weekly cap counts real spend, so a refunded run's cost (BYOK
      // provider charges included) still counts. Only a Claude refusal that cost nothing is logged at 0.
      const freeRefusal = claudeUnavailable && !aborted && !err.afterOutput && !completedMainUsage && !usageError?.completedUsage &&
        !researchDidWork && !researchAccountingIncomplete && !chargedAgainstCap(errorUsage);
      // One row per run: a handler that already logged its success row (the
      // failure came while answering) is not logged again.
      if (!usageLogged) {
        await logUsage(
          userId,
          feature,
          provider,
          model,
          freeRefusal ? excludeFromCap(errorUsage) : errorUsage,
          latencyMs,
          aborted && !timedOut ? "cancelled" : "error",
          claudeUnavailable ? "claude_unavailable" : timedOut ? "timeout" : aborted ? "aborted" : invalidOutput ? "invalid_output" : "provider_error",
        );
      }
      // Tells the client to say "You were not charged": the units went back,
      // or this call ran inside a session that had already paid.
      const notCharged = refunded || rateLimit.charged === false ? { charged: false } : {};
      // A provider outage, a cut-off provider stream, or the time budget is
      // worth trying again as it is; the browser handles those quietly. Other
      // failures (an answer that failed validation, a save that failed) may
      // be bugs and are reported.
      const retryable = claudeUnavailable || timedOut || isIncompleteProviderStream(err) ? { retryable: true } : {};
      if (claudeUnavailable) {
        return new Response(JSON.stringify({ error: CLAUDE_UNAVAILABLE_MESSAGE, code: CLAUDE_UNAVAILABLE_CODE, ...notCharged, ...retryable }), { status: CLAUDE_UNAVAILABLE_STATUS, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (invalidOutput && !aborted) {
        return new Response(JSON.stringify({ error: "The AI answer came back malformed. Please try again.", code: "invalid_output", ...notCharged }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI request failed. Please try again.", code: "provider_error", ...notCharged, ...retryable }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  };

  if (!streamRequested) return await runFeature();
  return streamFeatureResponse(corsHeaders, streamCancel, runFeature, {
    recorder: resultKey ? createRunResultRecorder(supabase as unknown as RunResultsDatabase, userId, feature, resultKey) : undefined,
    deadlineMs: STREAM_DEADLINE_MS - (Date.now() - receivedAt),
    endMs: workerTimeLeft(receivedAt),
  });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
