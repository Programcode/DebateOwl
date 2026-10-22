import type { JsonOutputSchema } from "./research.ts";

export const MAX_CROSSFIRE_REPLY_CHARS = 2_500;
export const MAX_CROSSFIRE_DEBRIEF_ITEMS = 8;
export const MAX_CROSSFIRE_REFERENCE_IDS = 6;

export type CrossfireDebriefItem = { turnIds: string[]; claim: string };
export type CrossfireBetterFollowUp = {
  turnIds: string[];
  question: string;
  reason: string;
};
export type CrossfireDebriefOutput = {
  concessionsSecured: CrossfireDebriefItem[];
  controlledQuestions: CrossfireDebriefItem[];
  weakOrRepetitiveQuestions: CrossfireDebriefItem[];
  evasiveOrIncompleteAnswers: CrossfireDebriefItem[];
  missedFollowUps: CrossfireDebriefItem[];
  betterFollowUpQuestions: CrossfireBetterFollowUp[];
  strongestExchange: CrossfireDebriefItem | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function crossfireReferenceIds(
  value: unknown,
  validIds: Set<string>,
  fieldName: string,
): { value: string[] } | { error: string } {
  if (
    !Array.isArray(value) || value.length < 1 ||
    value.length > MAX_CROSSFIRE_REFERENCE_IDS
  ) {
    return {
      error:
        `${fieldName}.turnIds must contain 1-${MAX_CROSSFIRE_REFERENCE_IDS} IDs`,
    };
  }
  const ids: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" || item.trim().length < 1 ||
      item.trim().length > 40 || !validIds.has(item.trim())
    ) {
      return {
        error: `${fieldName}.turnIds contains an invalid transcript ID`,
      };
    }
    if (ids.includes(item.trim())) {
      return { error: `${fieldName}.turnIds contains a duplicate ID` };
    }
    ids.push(item.trim());
  }
  return { value: ids };
}

function crossfireDebriefItem(
  value: unknown,
  validIds: Set<string>,
  fieldName: string,
): { value: CrossfireDebriefItem } | { error: string } {
  if (!isRecord(value) || !hasOnlyKeys(value, ["turnIds", "claim"])) {
    return { error: `${fieldName} is invalid` };
  }
  const turnIds = crossfireReferenceIds(value.turnIds, validIds, fieldName);
  if ("error" in turnIds) return turnIds;
  if (
    typeof value.claim !== "string" || !value.claim.trim() ||
    value.claim.trim().length > 800
  ) {
    return { error: `${fieldName}.claim is invalid` };
  }
  return { value: { turnIds: turnIds.value, claim: value.claim.trim() } };
}

/**
 * The provider-side shape of a debrief, mirroring validateCrossfireDebrief.
 * Turn IDs are pinned to the transcript's, so a reply cannot cite a turn that
 * does not exist. Counts, lengths, and duplicates stay with the validator.
 */
export function crossfireDebriefSchema(transcript: Array<{ id: string }>): JsonOutputSchema {
  const ids = [...new Set(transcript.map((turn) => turn.id))];
  const turnIds = { type: "array", items: ids.length ? { type: "string", enum: ids } : { type: "string" } };
  const item = {
    type: "object",
    properties: { turnIds, claim: { type: "string" } },
    required: ["turnIds", "claim"],
    additionalProperties: false,
  };
  const items = { type: "array", items: item };
  return {
    name: "crossfire_debrief",
    schema: {
      type: "object",
      properties: {
        concessionsSecured: items,
        controlledQuestions: items,
        weakOrRepetitiveQuestions: items,
        evasiveOrIncompleteAnswers: items,
        missedFollowUps: items,
        betterFollowUpQuestions: {
          type: "array",
          items: {
            type: "object",
            properties: { turnIds, question: { type: "string" }, reason: { type: "string" } },
            required: ["turnIds", "question", "reason"],
            additionalProperties: false,
          },
        },
        strongestExchange: { anyOf: [item, { type: "null" }] },
      },
      required: [
        "concessionsSecured",
        "controlledQuestions",
        "weakOrRepetitiveQuestions",
        "evasiveOrIncompleteAnswers",
        "missedFollowUps",
        "betterFollowUpQuestions",
        "strongestExchange",
      ],
      additionalProperties: false,
    },
  };
}

export function validateCrossfireDebrief(
  value: unknown,
  transcript: Array<{ id: string }>,
): { value: CrossfireDebriefOutput } | { error: string } {
  const referenceFields = [
    "concessionsSecured",
    "controlledQuestions",
    "weakOrRepetitiveQuestions",
    "evasiveOrIncompleteAnswers",
    "missedFollowUps",
  ] as const;
  const fields = [
    ...referenceFields,
    "betterFollowUpQuestions",
    "strongestExchange",
  ] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, fields)) {
    return { error: "Crossfire debrief response has unsupported fields" };
  }

  const validIds = new Set(transcript.map((turn) => turn.id));
  const items: Record<
    (typeof referenceFields)[number],
    CrossfireDebriefItem[]
  > = {
    concessionsSecured: [],
    controlledQuestions: [],
    weakOrRepetitiveQuestions: [],
    evasiveOrIncompleteAnswers: [],
    missedFollowUps: [],
  };
  for (const field of referenceFields) {
    const rawItems = value[field] === undefined ? [] : value[field];
    if (
      !Array.isArray(rawItems) || rawItems.length > MAX_CROSSFIRE_DEBRIEF_ITEMS
    ) {
      return {
        error:
          `${field} must be an array of at most ${MAX_CROSSFIRE_DEBRIEF_ITEMS} items`,
      };
    }
    for (let index = 0; index < rawItems.length; index += 1) {
      const item = crossfireDebriefItem(
        rawItems[index],
        validIds,
        `${field}[${index}]`,
      );
      if ("error" in item) return item;
      items[field].push(item.value);
    }
  }

  const rawFollowUps = value.betterFollowUpQuestions === undefined
    ? []
    : value.betterFollowUpQuestions;
  if (
    !Array.isArray(rawFollowUps) ||
    rawFollowUps.length > MAX_CROSSFIRE_DEBRIEF_ITEMS
  ) {
    return {
      error:
        `betterFollowUpQuestions must be an array of at most ${MAX_CROSSFIRE_DEBRIEF_ITEMS} items`,
    };
  }
  const betterFollowUpQuestions: CrossfireBetterFollowUp[] = [];
  for (let index = 0; index < rawFollowUps.length; index += 1) {
    const item = rawFollowUps[index];
    if (
      !isRecord(item) || !hasOnlyKeys(item, ["turnIds", "question", "reason"])
    ) {
      return { error: `betterFollowUpQuestions[${index}] is invalid` };
    }
    const turnIds = crossfireReferenceIds(
      item.turnIds,
      validIds,
      `betterFollowUpQuestions[${index}]`,
    );
    if ("error" in turnIds) return turnIds;
    if (
      typeof item.question !== "string" || !item.question.trim() ||
      item.question.trim().length > MAX_CROSSFIRE_REPLY_CHARS
    ) {
      return { error: `betterFollowUpQuestions[${index}].question is invalid` };
    }
    if (
      typeof item.reason !== "string" || !item.reason.trim() ||
      item.reason.trim().length > 800
    ) {
      return { error: `betterFollowUpQuestions[${index}].reason is invalid` };
    }
    betterFollowUpQuestions.push({
      turnIds: turnIds.value,
      question: item.question.trim(),
      reason: item.reason.trim(),
    });
  }

  let strongestExchange: CrossfireDebriefItem | null = null;
  const rawStrongestExchange = value.strongestExchange === undefined
    ? null
    : value.strongestExchange;
  if (rawStrongestExchange !== null) {
    const item = crossfireDebriefItem(
      rawStrongestExchange,
      validIds,
      "strongestExchange",
    );
    if ("error" in item) return item;
    strongestExchange = item.value;
  }

  return { value: { ...items, betterFollowUpQuestions, strongestExchange } };
}
