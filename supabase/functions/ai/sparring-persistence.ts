const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MOTION_LENGTH = 1_200;
const MAX_LANGUAGE_LENGTH = 32;
const MAX_SPEECHES = 12;
const MAX_SPEECH_CONTENT_LENGTH = 6_000;
const MAX_ROLE_LENGTH = 120;

/** Facts the browser measured while the user spoke a speech aloud. */
export type SparringSpeechDelivery = {
  speakingSeconds: number;
  wordCount: number;
  wordsPerMinute: number;
  fillerCount: number;
  fillers: Array<{ word: string; count: number }>;
  longPauses: number;
  longestPauseSeconds: number;
};

export type SparringPersistenceSpeech = {
  id: string;
  turnId: string;
  speaker: "user" | "ai";
  side: "pro" | "con";
  role: string;
  content: string;
  createdAt: number;
  timeLimitSeconds: number;
  timeUsedSeconds: number;
  integrityToken?: string;
  delivery?: SparringSpeechDelivery;
};

export type SparringRequest = {
  action: "respond" | "score";
  sessionId: string;
  motion: string;
  userSide: "pro" | "con";
  format: "standard" | "ld" | "pf";
  difficulty: "easy" | "medium" | "hard";
  speeches: SparringPersistenceSpeech[];
  language: string;
  currentTurn?: {
    id: string;
    label: string;
    side: "pro" | "con";
    kind: SparringTurnKind;
    timeLimitSeconds: number;
  };
};

export type SparringScorecardRecord = {
  userScore: number;
  aiScore: number;
  categories: Array<{
    name: "Logic" | "Evidence" | "Delivery" | "Strategy";
    userScore: number;
    aiScore: number;
    feedback: string;
  }>;
  overallFeedback: string;
  keyMoments: string[];
  improvementAreas: string[];
  winner: "user" | "ai" | "tie";
  verdict: string;
};

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SparringDatabaseSchema = {
  public: {
    Tables: {
      sparring_sessions: {
        Row: {
          id: string;
          user_id: string;
          motion: string;
          user_side: string;
          format: string;
          difficulty: string;
          persona: string;
          turns: Json;
          judge_comments: Json;
          final_evaluation: Json | null;
          status: string;
          claim_token: string | null;
          schema_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Partial<{
          turns: Json;
          final_evaluation: Json | null;
          status: string;
          updated_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      sparring_request_started_at: { Args: Record<PropertyKey, never>; Returns: string };
      claim_sparring_score_session: {
        Args: { p_payload: Json; p_request_started_at: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type SparringProviderOutput =
  | { action: "respond"; speech: { content: string; strategy: string; targetedPoints: string[] } }
  | { action: "score"; scorecard: SparringScorecardRecord };

type SparringTurnKind = "introductor" | "r1" | "r2" | "conclusor" | "opening" | "constructive" | "rebuttal" | "summary" | "final";

type PlannedTurn = {
  label: string;
  side: "pro" | "con";
  kind: SparringTurnKind;
  timeLimitSeconds: number;
};

const SPARRING_TURN_PLANS: Record<SparringRequest["format"], readonly PlannedTurn[]> = {
  standard: [
    { label: "Pro Introductor", side: "pro", kind: "introductor", timeLimitSeconds: 240 },
    { label: "Con Introductor", side: "con", kind: "introductor", timeLimitSeconds: 240 },
    { label: "Pro R1", side: "pro", kind: "r1", timeLimitSeconds: 360 },
    { label: "Con R1", side: "con", kind: "r1", timeLimitSeconds: 360 },
    { label: "Pro R2", side: "pro", kind: "r2", timeLimitSeconds: 360 },
    { label: "Con R2", side: "con", kind: "r2", timeLimitSeconds: 360 },
    { label: "Pro Conclusor", side: "pro", kind: "conclusor", timeLimitSeconds: 180 },
    { label: "Con Conclusor", side: "con", kind: "conclusor", timeLimitSeconds: 180 },
  ],
  ld: [
    { label: "Affirmative constructive", side: "pro", kind: "constructive", timeLimitSeconds: 360 },
    { label: "Negative constructive", side: "con", kind: "constructive", timeLimitSeconds: 420 },
    { label: "First affirmative rebuttal", side: "pro", kind: "rebuttal", timeLimitSeconds: 240 },
    { label: "Negative rebuttal", side: "con", kind: "rebuttal", timeLimitSeconds: 360 },
    { label: "Second affirmative rebuttal", side: "pro", kind: "final", timeLimitSeconds: 180 },
  ],
  pf: [
    { label: "Pro constructive", side: "pro", kind: "constructive", timeLimitSeconds: 240 },
    { label: "Con constructive", side: "con", kind: "constructive", timeLimitSeconds: 240 },
    { label: "Pro rebuttal", side: "pro", kind: "rebuttal", timeLimitSeconds: 240 },
    { label: "Con rebuttal", side: "con", kind: "rebuttal", timeLimitSeconds: 240 },
    { label: "Pro summary", side: "pro", kind: "summary", timeLimitSeconds: 180 },
    { label: "Con summary", side: "con", kind: "summary", timeLimitSeconds: 180 },
    { label: "Pro final focus", side: "pro", kind: "final", timeLimitSeconds: 120 },
    { label: "Con final focus", side: "con", kind: "final", timeLimitSeconds: 120 },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !(code <= 0x1f || code === 0x7f || (code >= 0x200b && code <= 0x200d) || code === 0xfeff);
    })
    .join("")
    .trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function integerInRange(value: unknown, min: number, max: number): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

const MAX_DELIVERY_FILLERS = 12;

// Measurements are optional client annotations. A malformed set is dropped,
// which leaves the speech judged as typed, rather than failing the round.
function parseDelivery(value: unknown): SparringSpeechDelivery | undefined {
  if (!isRecord(value)) return undefined;
  const { speakingSeconds, wordCount, wordsPerMinute, fillerCount, longPauses, longestPauseSeconds } = value;
  if (
    !integerInRange(speakingSeconds, 0, 86_400) || !integerInRange(wordCount, 0, 6_000) ||
    !integerInRange(wordsPerMinute, 0, 600) || !integerInRange(fillerCount, 0, 6_000) ||
    !integerInRange(longPauses, 0, 1_000) || !integerInRange(longestPauseSeconds, 0, 86_400)
  ) return undefined;
  if (!Array.isArray(value.fillers) || value.fillers.length > MAX_DELIVERY_FILLERS) return undefined;
  const fillers: SparringSpeechDelivery["fillers"] = [];
  for (const item of value.fillers) {
    if (!isRecord(item)) return undefined;
    const word = cleanString(item.word, 40);
    if (!word || !integerInRange(item.count, 1, 6_000)) return undefined;
    fillers.push({ word, count: item.count });
  }
  return { speakingSeconds, wordCount, wordsPerMinute, fillerCount, fillers, longPauses, longestPauseSeconds };
}

function parseSpeech(value: unknown): SparringPersistenceSpeech | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 120);
  const turnId = cleanString(value.turnId, 120);
  const role = cleanString(value.role, MAX_ROLE_LENGTH);
  const content = cleanString(value.content, MAX_SPEECH_CONTENT_LENGTH);
  const speaker = value.speaker === "user" || value.speaker === "ai" ? value.speaker : null;
  const side = value.side === "pro" || value.side === "con" ? value.side : null;
  const integrityToken = value.integrityToken === undefined ? undefined : cleanString(value.integrityToken, 128);
  if (!id || !turnId || !role || !content || !speaker || !side) return null;
  if (speaker === "ai" && !integrityToken) return null;
  if (!finiteNumber(value.createdAt) || !integerInRange(value.timeLimitSeconds, 1, 86_400) || !integerInRange(value.timeUsedSeconds, 0, 86_400)) {
    return null;
  }
  // Only the user speaks into a microphone; the opponent's turns are text.
  const delivery = speaker === "user" ? parseDelivery(value.delivery) : undefined;
  return {
    id,
    turnId,
    speaker,
    side,
    role,
    content,
    createdAt: value.createdAt,
    timeLimitSeconds: value.timeLimitSeconds,
    timeUsedSeconds: value.timeUsedSeconds,
    ...(integrityToken ? { integrityToken } : {}),
    ...(delivery ? { delivery } : {}),
  };
}

function integrityPayload(
  request: Pick<SparringRequest, "sessionId" | "motion" | "userSide" | "format" | "difficulty">,
  userId: string,
  speech: Pick<SparringPersistenceSpeech, "turnId" | "side" | "content">,
): string {
  return JSON.stringify([
    1,
    userId,
    request.sessionId,
    request.motion,
    request.userSide,
    request.format,
    request.difficulty,
    speech.turnId,
    speech.side,
    speech.content,
  ]);
}

async function importIntegrityKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/** Derive a domain-separated signing key when no dedicated deployment secret exists. */
export async function deriveSparringIntegritySecret(rootSecret: string): Promise<string> {
  const key = await importIntegrityKey(rootSecret);
  const derived = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("DebateLab sparring integrity key v1"),
  );
  return encodeBase64Url(derived);
}

function decodeBase64Url(value: string): ArrayBuffer | null {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
  } catch {
    return null;
  }
}

/** Sign provider-authored turns so a caller cannot manufacture AI speeches. */
export async function createSparringSpeechIntegrityToken(
  request: Pick<SparringRequest, "sessionId" | "motion" | "userSide" | "format" | "difficulty">,
  userId: string,
  speech: Pick<SparringPersistenceSpeech, "turnId" | "side" | "content">,
  secret: string,
): Promise<string> {
  const key = await importIntegrityKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(integrityPayload(request, userId, speech)));
  return encodeBase64Url(signature);
}

/** Verify every AI turn before it becomes context or a persisted score. */
export async function verifySparringTranscriptIntegrity(
  request: SparringRequest,
  userId: string,
  secrets: string | readonly string[],
): Promise<boolean> {
  const keys = await Promise.all((typeof secrets === "string" ? [secrets] : secrets).map(importIntegrityKey));
  if (keys.length === 0) return false;
  for (const speech of request.speeches) {
    if (speech.speaker !== "ai") continue;
    const signature = speech.integrityToken ? decodeBase64Url(speech.integrityToken) : null;
    if (!signature) return false;
    const payload = new TextEncoder().encode(integrityPayload(request, userId, speech));
    const valid = (await Promise.all(keys.map((key) => crypto.subtle.verify("HMAC", key, signature, payload)))).some(Boolean);
    if (!valid) return false;
  }
  return true;
}

function parseCurrentTurn(value: unknown): SparringRequest["currentTurn"] | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 120);
  const label = cleanString(value.label, 200);
  const side = value.side === "pro" || value.side === "con" ? value.side : null;
  const kinds: SparringTurnKind[] = ["introductor", "r1", "r2", "conclusor", "opening", "constructive", "rebuttal", "summary", "final"];
  const kind = typeof value.kind === "string" ? kinds.find((candidate) => candidate === value.kind) : undefined;
  if (!id || !label || !side || !kind || !integerInRange(value.timeLimitSeconds, 1, 86_400)) return null;
  return { id, label, side, kind, timeLimitSeconds: value.timeLimitSeconds };
}

/** Validate and normalize the untrusted request before it reaches a provider. */
export function parseSparringRequest(value: unknown): { request: SparringRequest } | { error: string } {
  if (!isRecord(value)) return { error: "Invalid sparring input" };
  const action = value.action === "respond" || value.action === "score" ? value.action : null;
  const sessionId = typeof value.sessionId === "string" && UUID_PATTERN.test(value.sessionId) ? value.sessionId : null;
  const motion = cleanString(value.motion, MAX_MOTION_LENGTH);
  const userSide = value.userSide === "pro" || value.userSide === "con" ? value.userSide : null;
  const formats: SparringRequest["format"][] = ["standard", "ld", "pf"];
  const difficulties: SparringRequest["difficulty"][] = ["easy", "medium", "hard"];
  const format = typeof value.format === "string" ? formats.find((candidate) => candidate === value.format) : undefined;
  const difficulty = typeof value.difficulty === "string" ? difficulties.find((candidate) => candidate === value.difficulty) : undefined;
  const language = cleanString(value.language, MAX_LANGUAGE_LENGTH);
  const rawSpeeches = Array.isArray(value.speeches) ? value.speeches : null;
  const speeches = rawSpeeches?.length !== undefined && rawSpeeches.length <= MAX_SPEECHES
    ? rawSpeeches.map(parseSpeech)
    : null;
  if (!action || !sessionId || !motion || !userSide || !format || !difficulty || !language || !speeches || speeches.some((speech) => speech === null)) {
    return { error: "Invalid sparring session context" };
  }
  const parsedSpeeches = speeches.filter((speech): speech is SparringPersistenceSpeech => speech !== null);
  const turnPlan = SPARRING_TURN_PLANS[format];
  const normalizedSpeeches: SparringPersistenceSpeech[] = [];
  const speechIds = new Set<string>();
  for (let index = 0; index < parsedSpeeches.length; index += 1) {
    const speech = parsedSpeeches[index];
    const expected = turnPlan[index];
    if (!expected) return { error: "Sparring transcript contains too many turns" };
    const expectedTurnId = `${format}-${index + 1}`;
    const expectedSpeaker = expected.side === userSide ? "user" : "ai";
    if (speech.turnId !== expectedTurnId || speech.side !== expected.side || speech.speaker !== expectedSpeaker) {
      return { error: "Sparring transcript does not match the round plan" };
    }
    if (speech.timeUsedSeconds > expected.timeLimitSeconds || speechIds.has(speech.id)) {
      return { error: "Sparring transcript timing or identity is invalid" };
    }
    speechIds.add(speech.id);
    normalizedSpeeches.push({
      ...speech,
      role: expected.label,
      timeLimitSeconds: expected.timeLimitSeconds,
    });
  }

  if (action === "score" && normalizedSpeeches.length !== turnPlan.length) {
    return { error: "A sparring score requires the completed round transcript" };
  }

  let currentTurn: SparringRequest["currentTurn"] | undefined;
  if (action === "respond") {
    const suppliedTurn = parseCurrentTurn(value.currentTurn);
    const expected = turnPlan[normalizedSpeeches.length];
    if (!suppliedTurn || !expected) return { error: "Invalid sparring current turn" };
    const expectedTurnId = `${format}-${normalizedSpeeches.length + 1}`;
    const expectedSpeaker = expected.side === userSide ? "user" : "ai";
    if (suppliedTurn.id !== expectedTurnId || expectedSpeaker !== "ai") {
      return { error: "Current turn must be the next AI turn in the round plan" };
    }
    currentTurn = { id: expectedTurnId, ...expected };
  }
  return {
    request: {
      action,
      sessionId,
      motion,
      userSide,
      format,
      difficulty,
      speeches: normalizedSpeeches,
      language,
      ...(currentTurn ? { currentTurn } : {}),
    },
  };
}

function parseScoreCategory(value: unknown): SparringScorecardRecord["categories"][number] | null {
  if (!isRecord(value)) return null;
  const names: SparringScorecardRecord["categories"][number]["name"][] = ["Logic", "Evidence", "Delivery", "Strategy"];
  const name = typeof value.name === "string" ? names.find((candidate) => candidate === value.name) : undefined;
  const feedback = cleanString(value.feedback, 2_000);
  if (!name || !feedback || !integerInRange(value.userScore, 0, 25) || !integerInRange(value.aiScore, 0, 25)) return null;
  return { name, userScore: value.userScore, aiScore: value.aiScore, feedback };
}

export function parseSparringScorecard(value: unknown): SparringScorecardRecord | null {
  if (!isRecord(value)) return null;
  const categories = Array.isArray(value.categories) ? value.categories.map(parseScoreCategory) : null;
  if (!categories || categories.length !== 4 || categories.some((category) => category === null)) return null;
  const parsedCategories = categories.filter((category): category is SparringScorecardRecord["categories"][number] => category !== null);
  if (parsedCategories.length !== 4) return null;
  const requiredNames = new Set(["Logic", "Evidence", "Delivery", "Strategy"]);
  const categoryNames = parsedCategories.map((category) => category.name);
  if (new Set(categoryNames).size !== 4 || categoryNames.some((name) => !requiredNames.has(name))) return null;
  const overallFeedback = cleanString(value.overallFeedback, 4_000);
  const verdict = cleanString(value.verdict, 2_000);
  const keyMoments = Array.isArray(value.keyMoments) ? value.keyMoments.map((item) => cleanString(item, 1_000)) : null;
  const improvementAreas = Array.isArray(value.improvementAreas) ? value.improvementAreas.map((item) => cleanString(item, 1_000)) : null;
  if (!overallFeedback || !verdict || !keyMoments || !improvementAreas || keyMoments.length > 12 || improvementAreas.length > 12 || keyMoments.some((item) => !item) || improvementAreas.some((item) => !item)) return null;
  if (!integerInRange(value.userScore, 0, 100) || !integerInRange(value.aiScore, 0, 100)) return null;
  if (value.winner !== "user" && value.winner !== "ai" && value.winner !== "tie") return null;
  return {
    userScore: value.userScore,
    aiScore: value.aiScore,
    categories: parsedCategories,
    overallFeedback,
    keyMoments: keyMoments.filter((item): item is string => Boolean(item)),
    improvementAreas: improvementAreas.filter((item): item is string => Boolean(item)),
    winner: value.winner,
    verdict,
  };
}

function scorecardMatchesDerivedValues(scorecard: SparringScorecardRecord): boolean {
  const userScore = scorecard.categories.reduce((total, category) => total + category.userScore, 0);
  const aiScore = scorecard.categories.reduce((total, category) => total + category.aiScore, 0);
  const winner = userScore === aiScore ? "tie" : userScore > aiScore ? "user" : "ai";
  return scorecard.userScore === userScore && scorecard.aiScore === aiScore && scorecard.winner === winner;
}

export function parseSparringProviderOutput(value: unknown, expectedAction: SparringRequest["action"]): SparringProviderOutput | null {
  if (!isRecord(value) || value.action !== expectedAction) return null;
  if (expectedAction === "respond") {
    if (!isRecord(value.speech)) return null;
    const content = cleanString(value.speech.content, MAX_SPEECH_CONTENT_LENGTH);
    const strategy = cleanString(value.speech.strategy, 2_000);
    const targetedPoints = Array.isArray(value.speech.targetedPoints)
      ? value.speech.targetedPoints.map((point) => cleanString(point, 500))
      : null;
    if (!content || !strategy || !targetedPoints || targetedPoints.length > 8 || targetedPoints.some((point) => !point)) return null;
    return {
      action: "respond",
      speech: { content, strategy, targetedPoints: targetedPoints.filter((point): point is string => Boolean(point)) },
    };
  }
  const scorecard = parseSparringScorecard(value.scorecard);
  return scorecard ? { action: "score", scorecard } : null;
}

/**
 * Repair the one common provider shape error without filling in omitted data.
 * Some JSON models place scorecard narrative fields beside `scorecard` rather
 * than inside it. Only known fields are moved, then totals and winner are
 * derived from the four validated category scores.
 */
export function normalizeSparringOutput(value: unknown, expectedAction: SparringRequest["action"]): unknown {
  if (expectedAction !== "score" || !isRecord(value) || value.action !== "score" || !isRecord(value.scorecard)) return value;

  const scorecard = { ...value.scorecard };
  const movableFields = ["keyMoments", "improvementAreas", "winner", "verdict"] as const;
  for (const field of movableFields) {
    if (scorecard[field] === undefined && value[field] !== undefined) scorecard[field] = value[field];
  }

  const parsed = parseSparringScorecard(scorecard);
  if (!parsed) return value;
  const userScore = parsed.categories.reduce((total, category) => total + category.userScore, 0);
  const aiScore = parsed.categories.reduce((total, category) => total + category.aiScore, 0);
  const winner = userScore === aiScore ? "tie" : userScore > aiScore ? "user" : "ai";
  return {
    action: "score",
    scorecard: { ...parsed, userScore, aiScore, winner },
  };
}

export function sparringPersona(difficulty: SparringRequest["difficulty"]): "coach" | "analytical" | "aggressive" {
  return difficulty === "easy" ? "coach" : difficulty === "medium" ? "analytical" : "aggressive";
}

type SparringQuery = {
  select: (columns: string) => SparringQuery;
  eq: (column: string, value: string) => SparringQuery;
  maybeSingle: () => PromiseLike<{ data?: unknown; error?: { code?: string; message?: string } | null }>;
};

export type SparringDatabase = {
  rpc: {
    (functionName: "sparring_request_started_at", args: Record<PropertyKey, never>): PromiseLike<{ data?: unknown; error?: { code?: string; message?: string } | null }>;
    (functionName: "claim_sparring_score_session", args: { p_payload: Json; p_request_started_at: string }): PromiseLike<{ data?: unknown; error?: { code?: string; message?: string } | null }>;
  };
  from: (table: "sparring_sessions") => {
    select: (columns: string) => SparringQuery;
    insert: (row: Record<string, unknown>) => PromiseLike<{ error?: { code?: string; message?: string } | null }>;
    update: (row: Record<string, unknown>) => SparringQuery;
    delete: () => SparringQuery;
  };
};

export type SparringScoreClaim =
  | { status: "claimed"; token: string }
  | { status: "in_progress" }
  | { status: "conflict" }
  | { status: "cleared" }
  | { status: "complete"; scorecard: SparringScorecardRecord };

function buildStartedSparringSessionRow(
  request: SparringRequest,
  userId: string,
  claimToken: string,
  now = new Date().toISOString(),
): { [key: string]: Json | undefined } {
  return {
    id: request.sessionId,
    user_id: userId,
    motion: request.motion,
    user_side: request.userSide,
    format: request.format,
    difficulty: request.difficulty,
    persona: sparringPersona(request.difficulty),
    turns: request.speeches.slice(0, MAX_SPEECHES),
    judge_comments: [],
    final_evaluation: null,
    claim_token: claimToken,
    status: "in_progress",
    created_at: now,
    updated_at: now,
  };
}

/** Atomically reserve the client UUID before quota or provider work begins. */
export async function claimSparringScoreSession(
  database: SparringDatabase,
  request: SparringRequest,
  userId: string,
): Promise<SparringScoreClaim> {
  const requestStart = await database.rpc("sparring_request_started_at", {});
  if (requestStart.error || typeof requestStart.data !== "string") {
    throw new Error(requestStart.error?.message || "Failed to establish the sparring erase fence");
  }
  const claimToken = crypto.randomUUID();
  const result = await database.rpc("claim_sparring_score_session", {
    p_payload: buildStartedSparringSessionRow(request, userId, claimToken),
    p_request_started_at: requestStart.data,
  });
  if (result.error) throw new Error(result.error.message || "Failed to reserve sparring session");
  if (!isRecord(result.data) || typeof result.data.status !== "string") {
    throw new Error("Invalid sparring score claim response");
  }
  if (result.data.status === "claimed" && typeof result.data.token === "string") {
    return { status: "claimed", token: result.data.token };
  }
  if (result.data.status === "complete") {
    const scorecard = parseSparringScorecard(result.data.scorecard);
    if (scorecard && scorecardMatchesDerivedValues(scorecard)) return { status: "complete", scorecard };
    throw new Error("Stored sparring score was invalid");
  }
  if (result.data.status === "conflict" || result.data.status === "in_progress" || result.data.status === "cleared") {
    return { status: result.data.status };
  }
  throw new Error("Unknown sparring score claim response");
}

export async function completeClaimedSparringScoreSession(
  database: SparringDatabase,
  request: SparringRequest,
  userId: string,
  claimToken: string,
  scorecard: SparringScorecardRecord,
): Promise<void> {
  const result = await database.from("sparring_sessions")
    .update({
      turns: request.speeches.slice(0, MAX_SPEECHES),
      final_evaluation: scorecard,
      status: "complete",
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.sessionId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .eq("claim_token", claimToken)
    .select("id")
    .maybeSingle();
  if (!isRecord(result.data)) {
    throw new Error(result.error?.message || "Sparring session was cleared or could not be completed");
  }
}

export async function releaseSparringScoreClaim(
  database: SparringDatabase,
  sessionId: string,
  userId: string,
  claimToken: string,
): Promise<void> {
  try {
    await database.from("sparring_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .eq("claim_token", claimToken)
      .select("id")
      .maybeSingle();
  } catch {
    // Best-effort cleanup. A stale in-progress claim remains private and can
    // be diagnosed without risking a cross-user delete.
  }
}
