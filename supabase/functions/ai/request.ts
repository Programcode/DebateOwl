// Request-body parsing and input hygiene shared by every ai feature handler.

export const MAX_INPUT_LENGTH = 50000;
export const MAX_REQUEST_BODY_BYTES = 200_000;
export const MAX_PERSONAL_SOURCE_IDS = 10;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROMPT_INJECTION_PATTERNS = [
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

export function sanitizePromptInput(input: string, fieldName: string): { sanitized: string; truncated: boolean } | { rejected: string } {
  if (typeof input !== "string") return { sanitized: "", truncated: false };
  const sanitized = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      console.warn(`[SECURITY] Prompt injection pattern=${pattern.source} length=${sanitized.length}`);
      return { rejected: `Suspicious content detected in ${fieldName}` };
    }
  }
  if (sanitized.length > MAX_INPUT_LENGTH) {
    console.warn(`[SECURITY] Input truncated: ${sanitized.length} chars -> ${MAX_INPUT_LENGTH}`);
    return { sanitized: sanitized.slice(0, MAX_INPUT_LENGTH), truncated: true };
  }
  return { sanitized, truncated: false };
}

export function sanitizeInput(input: Record<string, unknown>): { sanitized: Record<string, unknown>; truncated: boolean } | { rejected: string } {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function parsePersonalSourceIds(value: unknown): { value?: string[] } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value) || value.length > MAX_PERSONAL_SOURCE_IDS) {
    return { error: `sourceIds must contain at most ${MAX_PERSONAL_SOURCE_IDS} items` };
  }
  if (!value.every((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))) {
    return { error: "sourceIds must contain valid UUIDs" };
  }
  if (new Set(value).size !== value.length) return { error: "sourceIds must not contain duplicates" };
  return { value };
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJsonBody(request: Request): Promise<unknown> {
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
