// Crossfire request validation, source bounds, reply validation, and the
// signed single-use tokens that authorize a Jev turn signal.

import {
  type CrossfireDebriefPromptInput,
  type CrossfireNextTurnPromptInput,
  type CrossfirePromptConfig,
  type CrossfirePromptTurn,
} from "../prompt-builder.ts";
import { validateControlInput } from "../../_shared/control-enforcement.ts";
import {
  boundPromptSources,
  MAX_PROMPT_SOURCE_CHARS,
  MAX_PROMPT_SOURCE_COUNT,
  type PromptSource,
} from "../../_shared/prompts.ts";
import { MAX_CROSSFIRE_REPLY_CHARS } from "../../_shared/crossfire-response.ts";
import type { JsonOutputSchema } from "../../_shared/research.ts";
import { hasOnlyKeys, isRecord, sanitizePromptInput } from "../request.ts";
import { sparringIntegritySecret, supabase } from "../runtime.ts";

export const MAX_CROSSFIRE_PROMPT_CHARS = 100_000;
export const MAX_CROSSFIRE_TRANSCRIPT_TURNS = 40;
export const MAX_CROSSFIRE_TRANSCRIPT_CHARS = 24_000;
export const MAX_CROSSFIRE_TURN_CHARS = 2_000;
export const MAX_CROSSFIRE_RESOLUTION_CHARS = 500;
export const MAX_CROSSFIRE_ARGUMENT_CHARS = 16_000;
export const MAX_CROSSFIRE_SEED_QUESTIONS = 10;

export function crossfireText(value: unknown, fieldName: string, maxLength: number): { value: string } | { error: string } {
  if (typeof value !== "string") return { error: `${fieldName} must be a string` };
  const sanitized = sanitizePromptInput(value, fieldName);
  if ("rejected" in sanitized) return { error: sanitized.rejected };
  if (!sanitized.sanitized.trim()) return { error: `${fieldName} must not be empty` };
  if (sanitized.sanitized.length > maxLength) return { error: `${fieldName} exceeds ${maxLength} characters` };
  return { value: sanitized.sanitized.trim() };
}

export function crossfireSourceContent(value: unknown, fieldName: string): { value: string; truncated: boolean } | { error: string } {
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

export function crossfireConfig(value: unknown): { value: CrossfirePromptConfig } | { error: string } {
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

export function crossfireTranscript(value: unknown, config: CrossfirePromptConfig): { value: CrossfirePromptTurn[] } | { error: string } {
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

export type CrossfireNextTurnInput = CrossfireNextTurnPromptInput & { operation: "next-turn" };
export type CrossfireDebriefInput = CrossfireDebriefPromptInput & { operation: "debrief" };
export type CrossfireSignalInput = {
  operation: "signal";
  config: CrossfirePromptConfig;
  transcript: CrossfirePromptTurn[];
  reply: { type: "question" | "answer"; text: string };
  signalToken: string;
  language: string;
};
export type CrossfireInput = CrossfireNextTurnInput | CrossfireDebriefInput | CrossfireSignalInput;

export function validateCrossfireInput(value: unknown): { value: CrossfireInput } | { error: string } {
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

export const CROSSFIRE_SIGNAL_TOKEN_TTL_MS = 120_000;

export function crossfireSignalTokenPayload(userId: string, input: Pick<CrossfireSignalInput, "config" | "transcript" | "reply">, issuedAt: number): string {
  return JSON.stringify({
    domain: "debatelab-crossfire-signal-v1",
    userId,
    issuedAt,
    mode: input.config.mode,
    transcript: input.transcript,
    reply: input.reply,
  });
}

export async function crossfireSignalMac(payload: string): Promise<string> {
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

export async function createCrossfireSignalToken(userId: string, input: Pick<CrossfireSignalInput, "config" | "transcript" | "reply">): Promise<string> {
  const issuedAt = Date.now();
  return `${issuedAt}.${await crossfireSignalMac(crossfireSignalTokenPayload(userId, input, issuedAt))}`;
}

export async function verifyCrossfireSignalToken(userId: string, input: CrossfireSignalInput): Promise<boolean> {
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

export async function claimCrossfireSignalToken(userId: string, input: CrossfireSignalInput): Promise<boolean> {
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

export function boundCrossfireSources(value: unknown, enabled: boolean): { value: PromptSource[]; truncated: boolean } | { error: string } {
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

/** The provider-side shape of a next turn, mirroring crossfireReplyOutput. */
export function crossfireReplySchema(expectedReply: "question" | "answer"): JsonOutputSchema {
  return {
    name: "crossfire_turn",
    schema: {
      type: "object",
      properties: { type: { type: "string", enum: [expectedReply] }, text: { type: "string" } },
      required: ["type", "text"],
      additionalProperties: false,
    },
  };
}

export function crossfireReplyOutput(value: unknown, expectedReply: "question" | "answer"): { value: { type: "question" | "answer"; text: string } } | { error: string } {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "text"])) return { error: "Crossfire next-turn response must contain only type and text" };
  if (value.type !== expectedReply) return { error: `Crossfire response type must be ${expectedReply}` };
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text || text.length > MAX_CROSSFIRE_REPLY_CHARS) return { error: "Crossfire response text is empty or too long" };
  return { value: { type: expectedReply, text } };
}
