// Reads untrusted request and response bodies with a byte cap and, optionally,
// a deadline. A slow sender is cut off when the signal aborts, not when the
// platform's wall-clock limit ends the invocation.

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Body exceeds ${maxBytes} bytes.`);
  }
}

/** Settles with `promise`, or rejects with the signal's reason once it aborts. */
export function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export async function readBoundedBody(
  source: Request | Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const declaredLength = Number(source.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await source.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError(maxBytes);
  }
  if (!source.body) return "";
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      // A pending read is not guaranteed to reject when the fetch signal
      // aborts, so race each read against the signal directly.
      const { done, value } = await untilAborted(reader.read(), signal);
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new BodyTooLargeError(maxBytes);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
