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

// The hosted Edge runtime does not deliver a response until the function has
// read the request body. An oversized request is therefore read to the end and
// discarded, for at most this long, before the caller answers 413. An upstream
// response is cancelled instead.
const REQUEST_DRAIN_MS = 10_000;

async function discardRest(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal) {
  const limit = AbortSignal.timeout(REQUEST_DRAIN_MS);
  const until = signal ? AbortSignal.any([signal, limit]) : limit;
  try {
    while (!(await untilAborted(reader.read(), until)).done) {
      // Discard.
    }
  } catch {
    // Out of time or the sender went away; answer anyway.
  }
}

/** Reads and drops a request body the caller is refusing, so the refusal reaches the client. */
export async function discardRequestBody(req: Request, signal?: AbortSignal): Promise<void> {
  if (!req.body || req.bodyUsed) return;
  const reader = req.body.getReader();
  try {
    await discardRest(reader, signal);
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

export async function readBoundedBody(
  source: Request | Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const isRequest = source instanceof Request;
  const declaredLength = Number(source.headers.get("content-length"));
  const declaredTooLarge = Number.isFinite(declaredLength) && declaredLength > maxBytes;
  if (!source.body) {
    if (declaredTooLarge) throw new BodyTooLargeError(maxBytes);
    return "";
  }
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    if (declaredTooLarge) throw new BodyTooLargeError(maxBytes);
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
  } catch (error) {
    if (isRequest && error instanceof BodyTooLargeError) await discardRest(reader, signal);
    throw error;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
