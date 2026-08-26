export const MAX_RESPONSE_BYTES = 1_000_000;
export const MAX_RESPONSE_READ_MS = 10_000;

export async function readBoundedText(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
  maxReadMs = MAX_RESPONSE_READ_MS,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Source response exceeds the 1 MB import limit.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Source response body timed out.")), maxReadMs);
  });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error("Source response exceeds the 1 MB import limit.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    reader.cancel().catch(() => undefined);
  }
}
