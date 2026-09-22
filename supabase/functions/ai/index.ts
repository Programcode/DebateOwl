// Supabase Edge Function: AI proxy for DebateLab
// Keeps provider keys server-side and returns structured JSON.

// Inline CORS headers to avoid import issues
// SECURITY: Using production domain. Localhost calls from dev browser work because 
// browsers accept specific origin even when request is from different origin.
// SECURITY: Allow specific origins for CORS


type Feature = "generate" | "attack" | "brainstorm" | "factoids" | "ask" | "sparring" | "crossfire";

// Generate unique request ID for tracing
function generateRequestId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Structured logger for consistent log format
function log(requestId: string, level: "INFO" | "WARN" | "ERROR", message: string, data?: Record<string, unknown>) {
  const logObj = { requestId, level, message, ...data, timestamp: new Date().toISOString() };
  if (level === "ERROR") {
    console.error(JSON.stringify(logObj));
  } else if (level === "WARN") {
    console.warn(JSON.stringify(logObj));
  } else {
    console.log(JSON.stringify(logObj));
  }
}

// ============== SUPABASE CLIENT ==============

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAskBasePrompt,
  buildCrossfireDebriefPrompt,
  buildCrossfireNextTurnPrompt,
  buildUserPrompt,
  type CrossfireDebriefPromptInput,
  type CrossfireNextTurnPromptInput,
  type CrossfirePromptConfig,
  type CrossfirePromptTurn,
} from "./prompt-builder.ts";
import {
  enforceAskControls,
  enforceAttackControls,
  enforceBrainstormControls,
  enforceGenerateControls,
  validateControlInput,
} from "../_shared/control-enforcement.ts";
import {
  boundPromptSources,
  buildSystemPrompt,
  MAX_PROMPT_SOURCE_CHARS,
  MAX_PROMPT_SOURCE_COUNT,
  MAX_PROMPT_SOURCE_TOTAL_CHARS,
  type PromptSource,
} from "../_shared/prompts.ts";
import {
  claimSparringScoreSession,
  completeClaimedSparringScoreSession,
  createSparringSpeechIntegrityToken,
  deriveSparringIntegritySecret,
  normalizeSparringOutput,
  parseSparringProviderOutput,
  parseSparringRequest,
  releaseSparringScoreClaim,
  verifySparringTranscriptIntegrity,
  type SparringDatabase,
  type SparringDatabaseSchema,
  type SparringRequest,
} from "./sparring-persistence.ts";
import {
  calculateRequestCost,
  type CostResult,
  mergeNormalizedUsage,
  normalizeOpenRouterUsage,
  selectObservedUsage,
  type NormalizedUsage,
} from "../_shared/cost.ts";
import {
  AUTO_PRO,
  DEFAULT_MODEL,
  effectiveReasoningEffort,
  getModelCatalogEntry,
  isAutoModelSelection,
  isModelSelection,
  isReasoningEffort,
  MAX_REQUEST_OUTPUT_TOKENS,
  type ModelCatalogEntry,
  type ModelSelection,
  type ReasoningEffort,
} from "../_shared/model-catalog.ts";
import { resolveModelSelection } from "../_shared/auto-model-router.ts";
import { JEV_MODEL } from "../_shared/jev.ts";
import {
  identifyCaseSourceUsage,
  rankSourcesForRequest,
  type SourceAssessment,
  type SourceDecisionCandidate,
} from "../_shared/source-decisions.ts";
import { evaluateCrossfireExchange } from "../_shared/crossfire-signals.ts";
import {
  ASK_RESEARCH,
  applyFactoidsVerification,
  buildDiscoveredSources,
  buildResearchContext,
  DEEP_RESEARCH,
  deepResearch,
  decideAskSearch,
  exaGetContents,
  fetchJsonWithTimeout,
  getResearchSources,
  verifyUrl,
  withResearchPreferences,
  type Provider,
  type ResearchContext,
  type ResearchDeps,
  type ResearchSource,
} from "../_shared/research.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  checkRateLimit,
  checkUserBanned,
  logUsage,
  type RateLimitResult,
} from "../_shared/entitlements.ts";
import {
  MAX_CROSSFIRE_REPLY_CHARS,
  validateCrossfireDebrief,
} from "../_shared/crossfire-response.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const sparringSupabase = createClient<SparringDatabaseSchema>(supabaseUrl, supabaseServiceKey);
const sparringIntegritySecret = Deno.env.get("SPARRING_INTEGRITY_SECRET")?.trim()
  || await deriveSparringIntegritySecret(supabaseServiceKey);

function narrowSparringDatabase(database: object): SparringDatabase {
  return database as SparringDatabase;
}

// ============== RATE LIMITING & SUBSCRIPTION GATING ==============

const OPENROUTER_PROVIDER: Provider = "openrouter";

function modelForRequest(model: string): ModelCatalogEntry {
  const entry = getModelCatalogEntry(model);
  if (!entry) throw new Error("Unsupported model or provider combination");
  return entry;
}

async function getGlobalPrompt(feature: string): Promise<string | null> {
  // First try feature-specific prompt
  const { data: featurePrompt } = await supabase
    .from("global_prompts")
    .select("prompt_text")
    .eq("feature", feature)
    .eq("is_active", true)
    .single();

  if (featurePrompt?.prompt_text) {
    return featurePrompt.prompt_text;
  }

  // Fall back to 'all' prompt
  const { data: allPrompt } = await supabase
    .from("global_prompts")
    .select("prompt_text")
    .eq("feature", "all")
    .eq("is_active", true)
    .single();

  return allPrompt?.prompt_text || null;
}


function badRequest(message: string, corsHeaders: Record<string, string>, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_INPUT_LENGTH = 50000;
const MAX_ASK_CONTEXT_LENGTH = 32000;
export const MAX_REQUEST_BODY_BYTES = 200_000;
export const MAX_CROSSFIRE_PROMPT_CHARS = 100_000;
export const MAX_CROSSFIRE_TRANSCRIPT_TURNS = 40;
export const MAX_CROSSFIRE_TRANSCRIPT_CHARS = 24_000;
export const MAX_CROSSFIRE_TURN_CHARS = 2_000;
export const MAX_CROSSFIRE_RESOLUTION_CHARS = 500;
export const MAX_CROSSFIRE_ARGUMENT_CHARS = 16_000;
export const MAX_CROSSFIRE_SEED_QUESTIONS = 10;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|text)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instruction[s]?\s*:/i,
  /system\s*:\s*\[/i,
  /<!--\s*system\s*:/i,
  /\[\s*SYSTEM\s*\]/i,
  /\{\s*"role"\s*:\s*"system"/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|\s*system\s*\|>/i,
  /<system>/i,
  /###\s*instruction/i,
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
];

function sanitizePromptInput(input: string, fieldName: string): { sanitized: string; truncated: boolean } | { rejected: string } {
  if (typeof input !== "string") return { sanitized: "", truncated: false };
  const sanitized = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      console.warn(`[SECURITY] Prompt injection attempt detected in ${fieldName}: ${sanitized.slice(0, 200)}`);
      return { rejected: `Suspicious content detected in ${fieldName}` };
    }
  }
  if (sanitized.length > MAX_INPUT_LENGTH) {
    console.warn(`[SECURITY] Input truncated in ${fieldName}: ${sanitized.length} chars -> ${MAX_INPUT_LENGTH}`);
    return { sanitized: sanitized.slice(0, MAX_INPUT_LENGTH), truncated: true };
  }
  return { sanitized, truncated: false };
}

function sanitizeInput(input: Record<string, unknown>): { sanitized: Record<string, unknown>; truncated: boolean } | { rejected: string } {
  const result: Record<string, unknown> = {};
  let truncated = false;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const sanitizeResult = sanitizePromptInput(value, key);
      if ("rejected" in sanitizeResult) return sanitizeResult;
      truncated = truncated || sanitizeResult.truncated;
      result[key] = sanitizeResult.sanitized;
    } else if (Array.isArray(value)) {
      const sanitizedArray: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "object" && item !== null && "content" in item) {
          const contentResult = sanitizePromptInput(String((item as Record<string, unknown>).content || ""), `${key}[${i}].content`);
          if ("rejected" in contentResult) return contentResult;
          truncated = truncated || contentResult.truncated;
          sanitizedArray.push({ ...item, content: contentResult.sanitized });
        } else {
          sanitizedArray.push(item);
        }
      }
      result[key] = sanitizedArray;
    } else {
      result[key] = value;
    }
  }
  return { sanitized: result, truncated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function crossfireText(value: unknown, fieldName: string, maxLength: number): { value: string } | { error: string } {
  if (typeof value !== "string") return { error: `${fieldName} must be a string` };
  const sanitized = sanitizePromptInput(value, fieldName);
  if ("rejected" in sanitized) return { error: sanitized.rejected };
  if (!sanitized.sanitized.trim()) return { error: `${fieldName} must not be empty` };
  if (sanitized.sanitized.length > maxLength) return { error: `${fieldName} exceeds ${maxLength} characters` };
  return { value: sanitized.sanitized.trim() };
}

function crossfireSourceContent(value: unknown, fieldName: string): { value: string; truncated: boolean } | { error: string } {
  if (typeof value !== "string") return { error: `${fieldName} must be a string` };
  const sanitized = sanitizePromptInput(value, fieldName);
  if ("rejected" in sanitized) return { error: sanitized.rejected };
  const trimmed = sanitized.sanitized.trim();
  if (!trimmed) return { error: `${fieldName} must not be empty` };
  return {
    value: trimmed.slice(0, MAX_PROMPT_SOURCE_CHARS),
    truncated: trimmed.length > MAX_PROMPT_SOURCE_CHARS,
  };
}

function crossfireConfig(value: unknown): { value: CrossfirePromptConfig } | { error: string } {
  if (!isRecord(value)) return { error: "Crossfire config must be an object" };
  if (!hasOnlyKeys(value, ["resolution", "argument", "mode", "style", "durationSeconds", "useSourceLibrary", "seedQuestions"])) {
    return { error: "Crossfire config contains unsupported fields" };
  }
  const resolution = crossfireText(value.resolution, "config.resolution", MAX_CROSSFIRE_RESOLUTION_CHARS);
  if ("error" in resolution) return resolution;
  const argument = crossfireText(value.argument, "config.argument", MAX_CROSSFIRE_ARGUMENT_CHARS);
  if ("error" in argument) return argument;
  if (value.mode !== "question-ai" && value.mode !== "ai-questions-user") return { error: "config.mode is invalid" };
  if (value.style !== "cooperative" && value.style !== "evasive" && value.style !== "aggressive") return { error: "config.style is invalid" };
  if (value.durationSeconds !== 180 && value.durationSeconds !== 300 && value.durationSeconds !== 480) return { error: "config.durationSeconds is invalid" };
  if (typeof value.useSourceLibrary !== "boolean") return { error: "config.useSourceLibrary must be a boolean" };
  if (!Array.isArray(value.seedQuestions) || value.seedQuestions.length > MAX_CROSSFIRE_SEED_QUESTIONS) {
    return { error: `config.seedQuestions must contain at most ${MAX_CROSSFIRE_SEED_QUESTIONS} items` };
  }
  const seedQuestions: string[] = [];
  for (let index = 0; index < value.seedQuestions.length; index += 1) {
    const question = crossfireText(value.seedQuestions[index], `config.seedQuestions[${index}]`, MAX_CROSSFIRE_TURN_CHARS);
    if ("error" in question) return question;
    seedQuestions.push(question.value);
  }
  return {
    value: {
      resolution: resolution.value,
      argument: argument.value,
      mode: value.mode,
      style: value.style,
      durationSeconds: value.durationSeconds,
      useSourceLibrary: value.useSourceLibrary,
      seedQuestions,
    },
  };
}

function crossfireTranscript(value: unknown, config: CrossfirePromptConfig): { value: CrossfirePromptTurn[] } | { error: string } {
  if (!Array.isArray(value) || value.length > MAX_CROSSFIRE_TRANSCRIPT_TURNS) {
    return { error: `transcript must contain at most ${MAX_CROSSFIRE_TRANSCRIPT_TURNS} turns` };
  }
  const transcript: CrossfirePromptTurn[] = [];
  const ids = new Set<string>();
  let totalCharacters = 0;
  for (let index = 0; index < value.length; index += 1) {
    const turn = value[index];
    if (!isRecord(turn) || !hasOnlyKeys(turn, ["id", "sequence", "speaker", "kind", "text", "createdAt"])) {
      return { error: `transcript[${index}] is invalid` };
    }
    const id = crossfireText(turn.id, `transcript[${index}].id`, 40);
    if ("error" in id) return id;
    if (ids.has(id.value)) return { error: `transcript contains duplicate turn id ${id.value}` };
    ids.add(id.value);
    if (typeof turn.sequence !== "number" || !Number.isInteger(turn.sequence) || turn.sequence !== index + 1) {
      return { error: `transcript[${index}].sequence must be ${index + 1}` };
    }
    if (turn.speaker !== "user" && turn.speaker !== "ai") return { error: `transcript[${index}].speaker is invalid` };
    if (turn.kind !== "question" && turn.kind !== "answer") return { error: `transcript[${index}].kind is invalid` };
    const expectedSpeaker = config.mode === "question-ai"
      ? (index % 2 === 0 ? "user" : "ai")
      : (index % 2 === 0 ? "ai" : "user");
    const expectedKind = expectedSpeaker === "user"
      ? (config.mode === "question-ai" ? "question" : "answer")
      : (config.mode === "question-ai" ? "answer" : "question");
    if (turn.speaker !== expectedSpeaker || turn.kind !== expectedKind) {
      return { error: `transcript[${index}] does not match the configured mode` };
    }
    const text = crossfireText(turn.text, `transcript[${index}].text`, MAX_CROSSFIRE_TURN_CHARS);
    if ("error" in text) return text;
    if (typeof turn.createdAt !== "number" || !Number.isInteger(turn.createdAt) || turn.createdAt < 0) {
      return { error: `transcript[${index}].createdAt is invalid` };
    }
    totalCharacters += text.value.length;
    if (totalCharacters > MAX_CROSSFIRE_TRANSCRIPT_CHARS) {
      return { error: `transcript exceeds ${MAX_CROSSFIRE_TRANSCRIPT_CHARS} characters` };
    }
    transcript.push({
      id: id.value,
      sequence: index + 1,
      speaker: turn.speaker,
      kind: turn.kind,
      text: text.value,
      createdAt: turn.createdAt,
    });
  }
  return { value: transcript };
}

type CrossfireNextTurnInput = CrossfireNextTurnPromptInput & { operation: "next-turn" };
type CrossfireDebriefInput = CrossfireDebriefPromptInput & { operation: "debrief" };
type CrossfireSignalInput = {
  operation: "signal";
  config: CrossfirePromptConfig;
  transcript: CrossfirePromptTurn[];
  reply: { type: "question" | "answer"; text: string };
  signalToken: string;
  language: string;
};
type CrossfireInput = CrossfireNextTurnInput | CrossfireDebriefInput | CrossfireSignalInput;

function validateCrossfireInput(value: unknown): { value: CrossfireInput } | { error: string } {
  if (!isRecord(value) || (value.operation !== "next-turn" && value.operation !== "debrief" && value.operation !== "signal")) {
    return { error: "Crossfire operation must be next-turn, debrief, or signal" };
  }
  const allowedKeys = value.operation === "next-turn"
    ? ["operation", "config", "transcript", "expectedReply", "language"]
    : value.operation === "signal"
      ? ["operation", "config", "transcript", "reply", "signalToken", "language"]
      : ["operation", "config", "transcript", "language"];
  if (!hasOnlyKeys(value, allowedKeys)) return { error: "Crossfire input contains unsupported fields" };
  const rawLanguage = value.language;
  const languageError = validateControlInput("crossfire", rawLanguage === undefined ? {} : { language: rawLanguage });
  if (languageError) return { error: languageError };
  const language = typeof rawLanguage === "string" ? rawLanguage : "en";
  const config = crossfireConfig(value.config);
  if ("error" in config) return config;
  const transcript = crossfireTranscript(value.transcript, config.value);
  if ("error" in transcript) return transcript;
  if (value.operation === "signal") {
    if (!isRecord(value.reply) || !hasOnlyKeys(value.reply, ["type", "text"]) ||
      (value.reply.type !== "question" && value.reply.type !== "answer")) return { error: "Crossfire signal reply is invalid" };
    const replyText = crossfireText(value.reply.text, "reply.text", MAX_CROSSFIRE_REPLY_CHARS);
    if ("error" in replyText) return replyText;
    const signalToken = crossfireText(value.signalToken, "signalToken", 128);
    if ("error" in signalToken) return signalToken;
    return {
      value: {
        operation: "signal",
        config: config.value,
        transcript: transcript.value,
        reply: { type: value.reply.type, text: replyText.value },
        signalToken: signalToken.value,
        language,
      },
    };
  }
  if (value.operation === "debrief") {
    if (transcript.value.length === 0) return { error: "Crossfire debrief transcript must not be empty" };
    return { value: { operation: "debrief", config: config.value, transcript: transcript.value, language } };
  }
  if (value.expectedReply !== "question" && value.expectedReply !== "answer") return { error: "expectedReply is invalid" };
  const lastTurn = transcript.value.at(-1);
  if (!lastTurn) {
    if (config.value.mode !== "ai-questions-user" || value.expectedReply !== "question") {
      return { error: "expectedReply does not match the empty transcript context" };
    }
  } else {
    if (lastTurn.speaker !== "user") return { error: "The next Crossfire turn must follow a user turn" };
    const expectedReply = lastTurn.kind === "question" ? "answer" : "question";
    if (value.expectedReply !== expectedReply) return { error: "expectedReply does not match the transcript context" };
  }
  return {
    value: {
      operation: "next-turn",
      config: config.value,
      transcript: transcript.value,
      expectedReply: value.expectedReply,
      language,
    },
  };
}

const CROSSFIRE_SIGNAL_TOKEN_TTL_MS = 120_000;

function crossfireSignalTokenPayload(userId: string, input: Pick<CrossfireSignalInput, "config" | "transcript" | "reply">, issuedAt: number): string {
  return JSON.stringify({
    domain: "debatelab-crossfire-signal-v1",
    userId,
    issuedAt,
    mode: input.config.mode,
    transcript: input.transcript,
    reply: input.reply,
  });
}

async function crossfireSignalMac(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sparringIntegritySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createCrossfireSignalToken(userId: string, input: Pick<CrossfireSignalInput, "config" | "transcript" | "reply">): Promise<string> {
  const issuedAt = Date.now();
  return `${issuedAt}.${await crossfireSignalMac(crossfireSignalTokenPayload(userId, input, issuedAt))}`;
}

async function verifyCrossfireSignalToken(userId: string, input: CrossfireSignalInput): Promise<boolean> {
  const [rawIssuedAt, suppliedMac, ...extra] = input.signalToken.split(".");
  const issuedAt = Number(rawIssuedAt);
  if (extra.length > 0 || !Number.isInteger(issuedAt) || !/^[a-f0-9]{64}$/.test(suppliedMac ?? "")) return false;
  const age = Date.now() - issuedAt;
  if (age < 0 || age > CROSSFIRE_SIGNAL_TOKEN_TTL_MS) return false;
  const expectedMac = await crossfireSignalMac(crossfireSignalTokenPayload(userId, input, issuedAt));
  let mismatch = expectedMac.length ^ suppliedMac.length;
  for (let index = 0; index < expectedMac.length; index += 1) mismatch |= expectedMac.charCodeAt(index) ^ suppliedMac.charCodeAt(index);
  return mismatch === 0;
}

async function claimCrossfireSignalToken(userId: string, input: CrossfireSignalInput): Promise<boolean> {
  const tokenMac = input.signalToken.split(".")[1];
  const { data, error } = await supabase.rpc("consume_daily_quota", {
    p_user_id: userId,
    p_limit: 1,
    p_quota_key: `crossfire_signal:${tokenMac}`,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.allowed);
}

function boundCrossfireSources(value: unknown, enabled: boolean): { value: PromptSource[]; truncated: boolean } | { error: string } {
  if (!enabled || value === undefined || value === null) return { value: [], truncated: false };
  if (!Array.isArray(value)) return { error: "sources must be an array when Source Library is enabled" };
  const normalized: PromptSource[] = [];
  let truncated = value.length > MAX_PROMPT_SOURCE_COUNT;
  for (let index = 0; index < Math.min(value.length, MAX_PROMPT_SOURCE_COUNT); index += 1) {
    const source = value[index];
    if (!isRecord(source)) return { error: `sources[${index}] is invalid` };
    const title = crossfireText(source.title, `sources[${index}].title`, 240);
    if ("error" in title) return title;
    const content = crossfireSourceContent(source.content, `sources[${index}].content`);
    if ("error" in content) return content;
    const type = crossfireText(source.type, `sources[${index}].type`, 64);
    if ("error" in type) return type;
    let origin: string | undefined;
    if (source.origin !== undefined && source.origin !== null) {
      const sourceOrigin = crossfireText(source.origin, `sources[${index}].origin`, 240);
      if ("error" in sourceOrigin) return sourceOrigin;
      origin = sourceOrigin.value;
    }
    truncated = truncated || content.truncated;
    normalized.push({ title: title.value, content: content.value, type: type.value, ...(origin ? { origin } : {}) });
  }
  const bounded = boundPromptSources(normalized);
  truncated = truncated || bounded.length < normalized.length || bounded.some((source, index) => source.content.length !== normalized[index].content.length);
  return { value: bounded, truncated };
}

function truncateTextToBudget(text: string, budget: number): { text: string; truncated: boolean } {
  if (budget <= 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= budget) return { text, truncated: false };
  return { text: text.slice(0, budget) + "\n[Context truncated to fit request limits.]", truncated: true };
}

class InvalidJsonResponseError extends Error {
  readonly providerName: string;
  readonly rawText: string;
  /** Token usage of the failed attempt so repair retries can bill it. */
  usage?: NormalizedUsage;

  constructor(providerName: string, rawText: string) {
    super(`${providerName} returned invalid JSON`);
    this.name = "InvalidJsonResponseError";
    this.providerName = providerName;
    this.rawText = rawText;
  }
}

/**
 * Parses provider content, attaching the attempt's token usage to a parse
 * failure so callAI's repair retry can fold it into the final accounting.
 */
function parseProviderContent(
  text: string,
  providerName: string,
  usage: NormalizedUsage | undefined
): { output: unknown; usage?: NormalizedUsage } {
  try {
    return { output: parseJsonFromText(text, providerName), usage };
  } catch (err) {
    if (err instanceof InvalidJsonResponseError && usage) err.usage = usage;
    throw err;
  }
}

function parseJsonFromText(text: string, providerName: string) {
  if (!text) throw new Error(`${providerName} returned empty response content`);
  try {
    return JSON.parse(text);
  } catch {
    const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (codeBlock?.[1]) {
      try { return JSON.parse(codeBlock[1]); } catch { /* fall through */ }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
  }
  throw new InvalidJsonResponseError(providerName, text);
}

// ============== AI PROVIDER CALLS ==============

function cleanGeneratedText(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/[—–]/g, ", ")
      .replace(/\b(Magnitude|Probability|Timeframe):\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (Array.isArray(value)) return value.map(cleanGeneratedText);
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      cleaned[key] = cleanGeneratedText(child);
    }
    return cleaned;
  }
  return value;
}

interface AIResult {
  output: unknown;
  usage?: NormalizedUsage;
}

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: unknown;
};

function normalizeProviderUsage(usage: unknown): NormalizedUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  return normalizeOpenRouterUsage(usage as Record<string, unknown>);
}

function missingOpenRouterUsage(reason: string): NormalizedUsage {
  return { incomplete: true, raw: { openrouter_usage_missing: reason } };
}

function attachMissingUsage(error: unknown, reason: string): unknown {
  if (!error || typeof error !== "object") return error;
  const errorWithUsage = error as { usage?: NormalizedUsage };
  if (!errorWithUsage.usage) errorWithUsage.usage = missingOpenRouterUsage(reason);
  return error;
}

async function callAI(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal
): Promise<AIResult> {
  try {
    return await callAIOnce(provider, model, systemPrompt, messages, temperature, reasoningEffort, signal);
  } catch (err) {
    if (!(err instanceof InvalidJsonResponseError)) throw attachMissingUsage(err, "call");

    console.warn(`[AI] ${err.providerName} returned invalid JSON; retrying with repair prompt`);
    let retry: AIResult;
    try {
      retry = await callAIOnce(
        provider,
        model,
        `${systemPrompt}\n\nJSON REPAIR INSTRUCTION: Return only valid JSON matching this schema, no prose.`,
        withJsonRepairPrompt(messages),
        0,
        reasoningEffort,
        signal,
      );
    } catch (retryError) {
      // Preserve the completed first attempt if cancellation or another
      // failure prevents the repair attempt from returning a result.
      const retryUsage = retryError && typeof retryError === "object" && "usage" in retryError
        ? (retryError as { usage?: NormalizedUsage }).usage ?? missingOpenRouterUsage("repair_retry")
        : missingOpenRouterUsage("repair_retry");
      const usage = mergeNormalizedUsage([err.usage, retryUsage]);
      if (usage && retryError && typeof retryError === "object") {
        const errorWithUsage = retryError as {
          usage?: NormalizedUsage;
          completedUsage?: NormalizedUsage;
        };
        errorWithUsage.usage = usage;
        // The first response was parsed before the retry began, so retain it
        // even if the retry is the operation cancelled by the caller.
        errorWithUsage.completedUsage = err.usage;
      }
      throw attachMissingUsage(retryError, "repair_retry");
    }
    // The failed attempt still consumed tokens; bill both.
    return {
      output: retry.output,
      usage: mergeNormalizedUsage([err.usage, retry.usage]),
    };
  }
}

function withJsonRepairPrompt(messages: Array<{ role: string; content: string }>) {
  const repair = "Your previous response was not valid JSON. Return only valid JSON matching this schema, no prose. Re-answer the original request as a single JSON object. Do not include markdown fences or explanations.";
  if (messages.length === 0) return [{ role: "user", content: repair }];

  const repaired = [...messages];
  const last = repaired[repaired.length - 1];
  if (last.role === "user") {
    repaired[repaired.length - 1] = { ...last, content: `${last.content}\n\n${repair}` };
    return repaired;
  }

  repaired.push({ role: "user", content: repair });
  return repaired;
}

async function callAIOnce(
  provider: Provider,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal
): Promise<AIResult> {
  if (provider !== OPENROUTER_PROVIDER) throw new Error(`Unsupported provider: ${provider}`);
  return await callOpenRouter(
    [{ role: "system", content: systemPrompt }, ...messages],
    model,
    temperature,
    reasoningEffort,
    signal,
  );
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal,
): Promise<AIResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const modelEntry = modelForRequest(model);
  const payload: Record<string, unknown> = {
    model,
    messages,
    max_tokens: Math.min(modelEntry.maxTokens, MAX_REQUEST_OUTPUT_TOKENS),
    response_format: { type: "json_object" },
    reasoning: { effort: reasoningEffort, exclude: true },
    provider: { require_parameters: true },
  };
  if (modelEntry.supportsTemperature) payload.temperature = temperature;

  const { response, data, errorBody } = await fetchJsonWithTimeout<OpenRouterResponse>("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  }, 60000, signal);
  if (!response.ok) throw new Error(`OpenRouter error: ${errorBody ?? ""}`);
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) throw new Error("OpenRouter returned no choices");
  const usage = normalizeProviderUsage(data.usage) ?? missingOpenRouterUsage("response");
  return parseProviderContent(data.choices[0]?.message?.content ?? "", "OpenRouter", usage);
}

function extractUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text.match(urlRegex) || []).map((url) => url.replace(/[),.;!?]+$/g, ""));
}

// Dynamic date context for prompts - ensures AI knows the current year
function getCurrentDateContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  return `CURRENT DATE: ${now.toLocaleDateString('en-US', options)} (${now.getFullYear()})`;
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

async function readBoundedJsonBody(request: Request): Promise<unknown> {
  if (!request.body) return request.json();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const onAbort = () => {
    void reader.cancel(request.signal.reason);
  };
  if (request.signal.aborted) onAbort();
  else request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function crossfireReplyOutput(value: unknown, expectedReply: "question" | "answer"): { value: { type: "question" | "answer"; text: string } } | { error: string } {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "text"])) return { error: "Crossfire next-turn response must contain only type and text" };
  if (value.type !== expectedReply) return { error: `Crossfire response type must be ${expectedReply}` };
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text || text.length > MAX_CROSSFIRE_REPLY_CHARS) return { error: "Crossfire response text is empty or too long" };
  return { value: { type: expectedReply, text } };
}

// ============== MAIN HANDLER ==============

export async function handleRequest(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }
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
  const feature = typeof body.feature === "string" ? body.feature as Feature : undefined;
  const rawInput = body.input;
  const rawModel = (typeof body.model === "string" ? body.model : "") || DEFAULT_MODEL;
  if (!isModelSelection(rawModel)) {
    log(requestId, "WARN", "Rejected unsupported model/provider combination", { model: rawModel });
    return badRequest("Unsupported model or provider combination", corsHeaders);
  }
  const requestedModel: ModelSelection = rawModel;
  let model = DEFAULT_MODEL as string;
  let modelEntry: ModelCatalogEntry = modelForRequest(DEFAULT_MODEL);
  let resolvedModelMeta: string | undefined;
  const provider: Provider = OPENROUTER_PROVIDER;
  const requestedReasoningEffort = body.reasoningEffort === undefined
    ? undefined
    : isReasoningEffort(body.reasoningEffort) ? body.reasoningEffort : null;
  if (requestedReasoningEffort === null) return badRequest("Invalid reasoning effort", corsHeaders);
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
  // Crossfire has non-overridable transcript-grounding and typed-session
  // safety rules. Ignore both user and admin custom prompts for this feature.
  const customSystemPrompt = feature === "crossfire"
    ? null
    : body.customSystemPrompt as string | null | undefined;
  const rawSources = body.sources;

  // Log incoming request
  log(requestId, "INFO", "Request received", { feature, provider, model: requestedModel, sourcesCount: Array.isArray(rawSources) ? rawSources.length : 0 });

  if (!feature) return badRequest("Missing feature", corsHeaders);
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
    const sourcesResult = boundCrossfireSources(rawSources, crossfireInput.config.useSourceLibrary);
    if ("error" in sourcesResult) {
      log(requestId, "WARN", "Crossfire source validation failed", { reason: sourcesResult.error });
      return badRequest(sourcesResult.error, corsHeaders);
    }
    crossfireSources = sourcesResult.value;
    crossfireSourcesTruncated = sourcesResult.truncated;
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
  if (customSystemPrompt) {
    const promptResult = sanitizePromptInput(customSystemPrompt, "customSystemPrompt");
    if ("rejected" in promptResult) {
      log(requestId, "WARN", "Custom prompt rejected", { reason: promptResult.rejected });
      return badRequest(promptResult.rejected, corsHeaders);
    }
    responseTruncated = responseTruncated || promptResult.truncated;
  }
  let validatedSparringRequest: SparringRequest | undefined;
  if (feature === "sparring") {
    const sparringResult = parseSparringRequest(sanitizedInput);
    if ("error" in sparringResult) {
      log(requestId, "WARN", "Invalid sparring request", { reason: sparringResult.error });
      return badRequest(sparringResult.error, corsHeaders);
    }
    validatedSparringRequest = sparringResult.request;
  }
  let sourceAssessments: SourceAssessment[] = [];
  const successBody = (payload: Record<string, unknown>) => {
    const meta = {
      ...(responseTruncated ? { truncated: true } : {}),
      ...(resolvedModelMeta ? { requestedModel, resolvedModel: resolvedModelMeta } : {}),
    };
    const enriched = sourceAssessments.length > 0 ? { ...payload, sourceAssessments } : payload;
    return Object.keys(meta).length > 0 ? { ...enriched, meta } : enriched;
  };

  // Require a valid user session for all AI requests.
  // The frontend already enforces auth; this protects the endpoint even when
  // gateway JWT verification is disabled.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    log(requestId, "WARN", "Missing authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    log(requestId, "WARN", "Auth token validation failed", { error: authError?.message });
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId: string = user.id;
  log(requestId, "INFO", "User authenticated", { userId });

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
      signal: req.signal,
    });
    const signalUsage = evaluated.jev?.usage ?? evaluated.jevUsage;
    if (signalUsage) await logUsage(userId, "jev_crossfire_signal", provider, JEV_MODEL, signalUsage, undefined, evaluated.jevUsage ? "error" : "success", evaluated.jevUsage ? "jev_incomplete" : undefined);
    return new Response(JSON.stringify(successBody({ output: evaluated.signal ? { signal: evaluated.signal } : {} })), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      return new Response(JSON.stringify(successBody({
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
    rateLimit = await checkRateLimit(userId, requestedModel);
  } catch (error) {
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
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
      sparringScoreClaimed = false;
    }
    await logUsage(userId, feature, provider, requestedModel, undefined, undefined, "rate_limited", rateLimit.code);
    return new Response(JSON.stringify({
      error: rateLimit.reason,
      code: rateLimit.code,
      limit: rateLimit.limit,
      current: rateLimit.current
    }), {
      status: rateLimit.statusCode || 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const routingStartedAt = Date.now();
  try {
    const resolution = await resolveModelSelection({
      requestedModel,
      feature,
      input: sanitizedInput,
      canAccessProModels: Boolean(rateLimit.canAccessProModels),
      reasoningEffort: requestedReasoningEffort,
      sourceCount: Array.isArray(rawSources) ? rawSources.length : 0,
      signal: req.signal,
    });
    model = resolution.resolvedModel;
    modelEntry = resolution.modelEntry;
    resolvedModelMeta = model;
    const routingUsage = resolution.jev?.usage ?? resolution.jevUsage;
    if (routingUsage) {
      await logUsage(userId, "jev_model_router", provider, JEV_MODEL, routingUsage, Date.now() - routingStartedAt, resolution.jevUsage ? "error" : "success", resolution.jevUsage ? "jev_incomplete" : undefined);
    }
  } catch (error) {
    if (sparringScoreClaimed && sparringScoreClaimToken && validatedSparringRequest) {
      await releaseSparringScoreClaim(sparringDatabase, validatedSparringRequest.sessionId, userId, sparringScoreClaimToken);
      sparringScoreClaimed = false;
    }
    const message = error instanceof Error ? error.message : "Model routing failed";
    log(requestId, "ERROR", "Model routing failed", { error: message });
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
    const ranked = await rankSourcesForRequest({
      feature,
      requestText: JSON.stringify(sanitizedInput),
      sources: sourceDecisionCandidates,
      signal: req.signal,
    });
    sourceAssessments = ranked.assessments;
    sources = ranked.sources.map(({ title, content, origin, type }) => ({ title, content, ...(origin ? { origin } : {}), type }));
    const rankingUsage = ranked.jev?.usage ?? ranked.jevUsage;
    if (rankingUsage) await logUsage(userId, "jev_source_ranking", provider, JEV_MODEL, rankingUsage, undefined, ranked.jevUsage ? "error" : "success", ranked.jevUsage ? "jev_incomplete" : undefined);
  }

  const reasoningEffort = effectiveReasoningEffort(model, requestedReasoningEffort ?? undefined, Boolean(rateLimit.canAccessProModels));
  log(requestId, "INFO", "Resolved model controls", {
    model: modelEntry.id,
    requestedReasoningEffort: requestedReasoningEffort ?? "medium",
    reasoningEffort,
    supportsTemperature: modelEntry.supportsTemperature,
  });

  const startTime = Date.now();
  // Usage from research sub-calls (search decision, follow-up queries) is
  // collected here so the parent request's row accounts for every token.
  const researchUsage: NormalizedUsage[] = [];
  let researchAccountingIncomplete = false;
  const researchDeps: ResearchDeps = {
    provider,
    model,
    reasoningEffort,
    signal: req.signal,
    onTimeout: () => {
      researchAccountingIncomplete = true;
    },
    callModel: async (args) => {
      try {
        const result = await callAI(args.provider, args.model, args.systemPrompt, args.messages, args.temperature, args.reasoningEffort, args.signal);
        // A provider that ignores cancellation must not append usage after the
        // research timeout has already been finalized by the parent request.
        if (result.usage && !args.signal?.aborted) researchUsage.push(result.usage);
        return { output: result.output };
      } catch (err) {
        const usageError = err && typeof err === "object"
          ? err as { usage?: NormalizedUsage; completedUsage?: NormalizedUsage }
          : undefined;
        const researchErrorUsage = selectObservedUsage(usageError, args.signal?.aborted === true);
        if (researchErrorUsage) researchUsage.push(researchErrorUsage);
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
  // Research counts only when it actually returned something to cite.
  const hasResearch = (research?: ResearchContext | null): research is ResearchContext =>
    Boolean(research && (research.rankedResults.length > 0 || research.readContent.length > 0));
  const buildSystemPromptFor = async (feature: Feature, research?: ResearchContext | null, promptSources = sources) =>
    buildSystemPrompt({
      feature,
      dateContext: getCurrentDateContext(),
      globalPrompt: await getGlobalPrompt(feature),
      // User-authored system overrides must not influence a persisted judge.
      customPrompt: feature === "sparring" ? null : customSystemPrompt ?? null,
      // Sparring is transcript-only. Do not let unrelated saved evidence alter
      // an opponent response or a judge's scorecard.
      sources: feature === "sparring" ? [] : promptSources,
      researchContext: hasResearch(research)
        ? "WEB RESEARCH RESULTS are attached to this request."
        : undefined,
    });
  try {
    // SPARRING: transcript-only opponent replies and scorecards. No research
    // branch runs here, and score persistence follows output validation.
    if (feature === "sparring") {
      const sparringRequest = validatedSparringRequest;
      if (!sparringRequest) throw new Error("Invalid sparring request");

      const systemPrompt = await buildSystemPromptFor(feature);
      const userPrompt = buildUserPrompt(feature, sparringRequest as unknown as Record<string, unknown>, "");
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
      const output = cleanGeneratedText(aiResult.output);
      const normalizedOutput = normalizeSparringOutput(output, sparringRequest.action);
      const parsedOutput = parseSparringProviderOutput(normalizedOutput, sparringRequest.action);
      if (!parsedOutput) throw new Error("AI response did not match the expected sparring schema");

      if (parsedOutput.action === "score") {
        await completeClaimedSparringScoreSession(
          sparringDatabase,
          sparringRequest,
          userId,
          sparringScoreClaimToken!,
          parsedOutput.scorecard,
        );
        sparringScoreClaimed = false;
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
      return new Response(JSON.stringify(successBody({
        output: responseOutput,
        sessionId: sparringRequest.sessionId,
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (feature === "crossfire") {
      if (!crossfireInput) throw new Error("Crossfire input was not validated");
      const userPrompt = crossfireInput.operation === "next-turn"
        ? buildCrossfireNextTurnPrompt(crossfireInput)
        : buildCrossfireDebriefPrompt(crossfireInput);
      if (userPrompt.length > MAX_CROSSFIRE_PROMPT_CHARS) {
        throw new Error(`Crossfire prompt exceeds ${MAX_CROSSFIRE_PROMPT_CHARS} characters`);
      }
      const systemPrompt = buildSystemPrompt({
        feature: "crossfire",
        dateContext: getCurrentDateContext(),
        sources: crossfireSources,
      });
      if (systemPrompt.length + userPrompt.length > MAX_CROSSFIRE_PROMPT_CHARS) {
        throw new Error(`Crossfire prompt exceeds ${MAX_CROSSFIRE_PROMPT_CHARS} characters`);
      }
      const aiResult = recordMainResult(await callAI(
        provider,
        model,
        systemPrompt,
        [{ role: "user", content: userPrompt }],
        temperature,
        reasoningEffort,
        req.signal,
      ));
      const cleanedOutput = cleanGeneratedText(aiResult.output);
      const output = crossfireInput.operation === "next-turn"
        ? crossfireReplyOutput(cleanedOutput, crossfireInput.expectedReply)
        : validateCrossfireDebrief(cleanedOutput, crossfireInput.transcript);
      if ("error" in output) throw new Error(output.error);

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
      return new Response(JSON.stringify(successBody({ output: output.value, ...(signalToken ? { signalToken } : {}) })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // FACTOIDS: Use deep research with multiple searches
    if (feature === "factoids") {
      const claim = String(sanitizedInput.claim || "");
      const region = String(sanitizedInput.region || "Global");
      const preferredSourceType = String(sanitizedInput.sourceType || "any");
      const timeframe = String(sanitizedInput.timeframe || "");
      const sourceCount = Math.min(15, Math.max(3, Number(sanitizedInput.sourceCount || 5)));

      // Perform deep research with multiple search rounds
      const research = await deepResearch(claim, region, researchDeps, withResearchPreferences(DEEP_RESEARCH, {
        preferredSourceType,
        timeframe,
      }));
      const searchContext = buildResearchContext(research);

      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];

      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
      const output = cleanGeneratedText(aiResult.output);

      // Post-process: quality floor. Only citations whose URL matches fetched,
      // non-weak research content may stay "verified"; everything else is
      // downgraded and filtered out below. Weak sources can appear only as
      // fallback context via discoveredSources, never as verified evidence.
      const factoidsOutput = output as { factoids?: unknown; verificationStatus?: string } | null;
      if (factoidsOutput && typeof factoidsOutput === "object" && Array.isArray(factoidsOutput.factoids)) {
        applyFactoidsVerification(output, research);
        factoidsOutput.factoids = (factoidsOutput.factoids as Array<{ citation?: { verified?: string } }>)
          .filter((f) => f && typeof f === "object" && !Array.isArray(f) && f.citation?.verified === "verified")
          .slice(0, sourceCount);
        factoidsOutput.verificationStatus = "complete";
      }

      const discoveredSources = buildDiscoveredSources(research);

      const latencyMs = Date.now() - startTime;
      if (output && typeof output === "object") {
        const askOutput = output as {
          model?: string;
          provider?: string;
          durationMs?: number;
          generatedAt?: string;
        };
        askOutput.model = model;
        askOutput.provider = provider;
        askOutput.durationMs = latencyMs;
        askOutput.generatedAt = new Date().toISOString();
      }

      // Log usage and return
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ASK: Optionally run web search and include URL context from chat
    if (feature === "ask") {
      const history = (sanitizedInput.history as Array<{ role: string; content: string }>) || [];
      const message = String(sanitizedInput.message || "");
      const mode = String(sanitizedInput.mode || "general");
      const citationMode = Boolean(sanitizedInput.citationMode);
      const webSearchEnabled = Boolean(sanitizedInput.webSearch);
      const prosConsMode = Boolean(sanitizedInput.prosConsMode);
      const argumentMapMode = Boolean(sanitizedInput.argumentMapMode);
      const shouldUseResearch = webSearchEnabled || citationMode;
      let askResearch: ResearchContext | null = null;
      let askSearchQuery = "";

      // 1) Read URLs already shared in chat to ground the response in user-provided material
      const urls = new Set<string>();
      extractUrls(message).forEach((u) => urls.add(u));
      history.slice(-3).forEach((m) => extractUrls(m.content).forEach((u) => urls.add(u)));

      let urlContext = "";
      if (urls.size > 0) {
        const contents = await Promise.all(Array.from(urls).slice(0, 3).map(async (u) => {
          const content = await exaGetContents(u, req.signal);
          return content.trim()
            ? `--- Content from ${u} ---\n${content.slice(0, 8000)}\n--- End of ${u} ---`
            : "";
        }));
        const usableContents = contents.filter(Boolean);
        if (usableContents.length > 0) {
          urlContext = "\n\nWEB PAGE CONTEXT:\n" + usableContents.join("\n");
        }
      }

      // 2) Optional web search in Ask mode. When the user explicitly enables
      // web search or citations, perform research instead of leaving it to the model.
      let webSearchContext = "";
      if (shouldUseResearch) {
        const searchDecision = await decideAskSearch(message, history, researchDeps);
        askSearchQuery = searchDecision.query || message.slice(0, 240);
        if (askSearchQuery) {
          askResearch = await deepResearch(askSearchQuery, "", researchDeps, ASK_RESEARCH);
          const renderedResearch = hasResearch(askResearch) ? buildResearchContext(askResearch) : "";
          if (renderedResearch) {
            webSearchContext = `\n\n${renderedResearch}`;
          }
        }
      }

      const askPromptInput = {
        message,
        mode,
        citationMode,
        webSearchEnabled,
        prosConsMode,
        argumentMapMode,
        researchAvailable: Boolean(webSearchContext || urlContext),
      };
      const initialBasePrompt = buildAskBasePrompt(askPromptInput);
      const contextBudget = Math.max(0, MAX_ASK_CONTEXT_LENGTH - initialBasePrompt.length);
      const webSearchBudget = Math.max(0, contextBudget - urlContext.length);
      const trimmedWebSearch = truncateTextToBudget(webSearchContext, webSearchBudget);
      webSearchContext = trimmedWebSearch.text;
      responseTruncated = responseTruncated || trimmedWebSearch.truncated;

      const urlBudget = Math.max(0, contextBudget - webSearchContext.length);
      const trimmedUrlContext = truncateTextToBudget(urlContext, urlBudget);
      urlContext = trimmedUrlContext.text;
      responseTruncated = responseTruncated || trimmedUrlContext.truncated;

      const researchAvailable = Boolean(webSearchContext || urlContext);
      const basePrompt = researchAvailable === askPromptInput.researchAvailable
        ? initialBasePrompt
        : buildAskBasePrompt({ ...askPromptInput, researchAvailable });
      const effectiveResearch = webSearchContext && askResearch ? askResearch : null;
      const systemPrompt = await buildSystemPromptFor(feature, effectiveResearch);
      const prompt = `${basePrompt}${urlContext}${webSearchContext}`;
      const messages = [...history, { role: "user", content: prompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
      const output = cleanGeneratedText(aiResult.output);

      if (output && typeof output === "object") {
        const typedOutput = output as {
          citations?: Array<{ claim: string; source?: string; verified?: boolean; note?: string }>;
          searchInfo?: { webSearchUsed: boolean; queries: string[]; sources: ResearchSource[] };
          uncertainties?: string[];
        };
        const citations = typedOutput.citations;
        if (Array.isArray(citations)) {
          await Promise.all(citations.map(async (citation) => {
            const source = typeof citation.source === "string" ? citation.source : "";
            const url = extractUrls(source)[0];
            if (!url) return;
            citation.verified = await verifyUrl(url);
          }));
        }

        const researchSources = effectiveResearch
          ? getResearchSources(effectiveResearch).filter((source) => webSearchContext.includes(source.url))
          : [];
        if (shouldUseResearch) {
          typedOutput.searchInfo = {
            webSearchUsed: researchSources.length > 0,
            queries: askResearch?.searches.map((search) => search.query) || (askSearchQuery ? [askSearchQuery] : []),
            sources: researchSources,
          };
        } else {
          delete typedOutput.searchInfo;
        }

        const citationFallbackSources = researchSources.filter((source) => source.qualityLabel !== "weak");
        if (citationMode && citationFallbackSources.length > 0 && (!Array.isArray(typedOutput.citations) || typedOutput.citations.length === 0)) {
          typedOutput.citations = citationFallbackSources.slice(0, 3).map((source) => ({
            claim: "Research source used for this answer",
            source: source.url,
            verified: source.verified,
            note: `${source.title} (${source.qualityLabel} ${source.sourceType})`,
          }));
          typedOutput.uncertainties = Array.isArray(typedOutput.uncertainties)
            ? typedOutput.uncertainties
            : [];
        } else if (citationMode && researchSources.length > 0 && citationFallbackSources.length === 0) {
          typedOutput.citations = [];
          typedOutput.uncertainties = [
            ...(Array.isArray(typedOutput.uncertainties) ? typedOutput.uncertainties : []),
            "Search ran, but the available sources were too weak for citation fallback.",
          ];
        }
        // Deterministic control enforcement runs last so fallback citations
        // respect the toggles too, and clarify mode always surfaces its note.
        enforceAskControls(typedOutput, { mode, citationMode, prosConsMode, argumentMapMode });
      }

      // Log usage and return
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GENERATE: Use deep research for evidence-backed arguments
    if (feature === "generate") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
      const side = String(sanitizedInput.side || "pro");
      const format = String(sanitizedInput.format || "custom");
      const length = String(sanitizedInput.length || "standard");
      const role = String(sanitizedInput.role || "intro");

      // Perform deep research to find supporting evidence
      console.log("[GENERATE] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", researchDeps, withResearchPreferences(DEEP_RESEARCH, {
        preferredSourceType: "any",
      }));
      const discoveredSources = buildDiscoveredSources(research);
      const discoveredCandidates: SourceDecisionCandidate[] = discoveredSources.map((source) => ({
        key: source.url,
        title: source.title,
        content: source.content,
        origin: source.url,
        type: source.sourceType ?? "url",
        qualityScore: source.qualityScore,
        qualityLabel: source.qualityLabel,
      }));
      const discoveredRanking = await rankSourcesForRequest({
        feature,
        requestText: JSON.stringify(sanitizedInput),
        sources: discoveredCandidates,
        signal: req.signal,
      });
      const discoveredRankingUsage = discoveredRanking.jev?.usage ?? discoveredRanking.jevUsage;
      if (discoveredRankingUsage) await logUsage(userId, "jev_source_ranking", provider, JEV_MODEL, discoveredRankingUsage, undefined, discoveredRanking.jevUsage ? "error" : "success", discoveredRanking.jevUsage ? "jev_incomplete" : undefined);
      const discoveredAssessmentByKey = new Map(discoveredRanking.assessments.map((assessment) => [assessment.key, assessment]));
      const rankedDiscoveredSources = discoveredRanking.sources.map((candidate) => {
        const source = discoveredSources.find((item) => item.url === candidate.key)!;
        const assessment = discoveredAssessmentByKey.get(candidate.key);
        if (!assessment) return source;
        const semantic: {
          relevance: number;
          importance: 0 | 1 | 2 | 3;
          strength: 0 | 1 | 2 | 3;
          evaluatedAt: string;
          useCount: number;
          caseUseCount: number;
          lastUsedInCase?: boolean;
          lastUsedAt?: string;
        } = { relevance: assessment.relevance, importance: assessment.importance, strength: assessment.strength, evaluatedAt: assessment.evaluatedAt, useCount: 1, caseUseCount: 0 };
        return { ...source, semantic };
      });
      const discoveredOrder = new Map(discoveredRanking.sources.map((source, index) => [source.key, index]));
      research.readContent.sort((a, b) => (discoveredOrder.get(a.url) ?? Number.MAX_SAFE_INTEGER) - (discoveredOrder.get(b.url) ?? Number.MAX_SAFE_INTEGER));
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
      const output = cleanGeneratedText(aiResult.output);

      // Preserve model evidence warnings when research exists. If research
      // returned no usable material, every contention still needs a source.
      if (output && typeof output === "object" && "contentions" in output) {
        const contentions = (output as { contentions?: unknown }).contentions;
        const hasUsableSources = getResearchSources(research).length > 0 || boundPromptSources(sources).length > 0;
        if (Array.isArray(contentions) && !hasUsableSources) {
          for (const contention of contentions) {
            if (contention && typeof contention === "object") {
              Object.assign(contention, { needsSource: true });
            }
          }
        }
      }

      // Post-process: fix timestamp
      if (output && typeof output === "object" && "metadata" in output) {
        const metadata = (output as { metadata: { generatedAt?: string; model?: string; provider?: string; durationMs?: number } }).metadata;
        if (!metadata.generatedAt ||
          metadata.generatedAt === "CURRENT_ISO_TIMESTAMP" ||
          metadata.generatedAt.includes("CURRENT") ||
          isNaN(new Date(metadata.generatedAt).getTime())) {
          metadata.generatedAt = new Date().toISOString();
        }
        metadata.model = model;
        metadata.provider = provider;
      }
      enforceGenerateControls(output, side, format, length, role);

      // Build discovered sources from research
      const activeAssessmentByKey = new Map(sourceAssessments.map((assessment) => [assessment.key, assessment]));
      const usageCandidates = [
        ...sourceDecisionCandidates.filter((source) => activeAssessmentByKey.get(source.key)?.retained).map((source) => ({
          ...source,
          importance: activeAssessmentByKey.get(source.key)?.importance ?? 0,
          strength: activeAssessmentByKey.get(source.key)?.strength ?? 0,
        })),
        ...discoveredRanking.sources.filter((source) => discoveredAssessmentByKey.get(source.key)?.retained).map((source) => ({
          ...source,
          importance: discoveredAssessmentByKey.get(source.key)?.importance ?? 0,
          strength: discoveredAssessmentByKey.get(source.key)?.strength ?? 0,
        })),
      ].slice(0, 10);
      const caseUsage = await identifyCaseSourceUsage({
        caseText: JSON.stringify(output),
        sources: usageCandidates,
        signal: req.signal,
      });
      const caseUsageCost = caseUsage.jev?.usage ?? caseUsage.jevUsage;
      if (caseUsageCost) await logUsage(userId, "jev_source_usage", provider, JEV_MODEL, caseUsageCost, undefined, caseUsage.jevUsage ? "error" : "success", caseUsage.jevUsage ? "jev_incomplete" : undefined);
      const usedByKey = new Map(caseUsage.sourceUsage.map((usage) => [usage.key, usage]));
      for (const assessment of sourceAssessments) {
        (assessment as SourceAssessment & { usedInCase?: boolean }).usedInCase = usedByKey.get(assessment.key)?.judgment === "used";
      }
      for (const source of rankedDiscoveredSources) {
        const semantic = "semantic" in source ? source.semantic : undefined;
        if (semantic) {
          const used = usedByKey.get(source.url)?.judgment === "used";
          semantic.lastUsedInCase = used;
          semantic.caseUseCount = used ? 1 : 0;
          if (used) semantic.lastUsedAt = new Date().toISOString();
        }
      }
      if (output && typeof output === "object" && "metadata" in output && isRecord((output as { metadata?: unknown }).metadata)) {
        (output as { metadata: Record<string, unknown> }).metadata.sourceUsage = caseUsage.sourceUsage;
      }
      console.log(`[GENERATE] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      if (output && typeof output === "object" && "metadata" in output) {
        const metadata = (output as { metadata: { durationMs?: number } }).metadata;
        metadata.durationMs = latencyMs;
      }
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources: rankedDiscoveredSources, sourceAssessments })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // BRAINSTORM: Use research to inform argument angles
    if (feature === "brainstorm") {
      const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
      const side = String(sanitizedInput.side || "both");
      const outputMode = String(sanitizedInput.outputMode || "topfive");

      // Perform deep research to find relevant context
      console.log("[BRAINSTORM] Starting deep research for motion:", motion);
      const research = await deepResearch(motion, "", researchDeps, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      // Build prompt with research context
      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
      const output = cleanGeneratedText(aiResult.output);
      enforceBrainstormControls(output, side, outputMode);

      // Build discovered sources from research
      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[BRAINSTORM] Found ${discoveredSources.length} sources`);

      // Log usage and return with sources
      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ATTACK: Use deep research for evidence-based critique
    if (feature === "attack") {
      const caseText = String(sanitizedInput.caseText || "");
      const detectFallacies = typeof sanitizedInput.detectFallacies === "boolean" ? sanitizedInput.detectFallacies : true;
      const analyzeWeighing = typeof sanitizedInput.analyzeWeighing === "boolean" ? sanitizedInput.analyzeWeighing : true;

      // Research the topic to find counter-evidence
      console.log("[ATTACK] Starting deep research for case analysis");
      const research = await deepResearch(caseText.slice(0, 500), "", researchDeps, DEEP_RESEARCH);
      const searchContext = buildResearchContext(research);

      const systemPrompt = await buildSystemPromptFor(feature, research);
      const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
      const messages = [{ role: "user", content: userPrompt }];
      const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
      const output = cleanGeneratedText(aiResult.output);
      enforceAttackControls(output, detectFallacies, analyzeWeighing);

      const discoveredSources = buildDiscoveredSources(research);
      console.log(`[ATTACK] Found ${discoveredSources.length} sources`);

      const latencyMs = Date.now() - startTime;
      await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
      return new Response(JSON.stringify(successBody({ output, discoveredSources })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback for any other feature
    const systemPrompt = await buildSystemPromptFor(feature);
    const userPrompt = buildUserPrompt(feature, sanitizedInput, "");
    const messages = [{ role: "user", content: userPrompt }];
    const fallbackResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, req.signal));
    const output = cleanGeneratedText(fallbackResult.output);

    const latencyMs = Date.now() - startTime;
    await logUsage(userId, feature, provider, model, mergeNormalizedUsage([fallbackResult.usage, ...researchUsageForLog()]), latencyMs);
    return new Response(JSON.stringify(successBody({ output })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ERROR]", message);

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
    const mainErrorUsage = completedMainUsage ?? selectObservedUsage(usageError, req.signal?.aborted === true);
    await logUsage(
      userId,
      feature,
      provider,
      model,
      mergeNormalizedUsage([
        mainErrorUsage,
        ...researchUsageForLog(),
      ]),
      latencyMs,
      "error",
      message.slice(0, 100),
    );
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
