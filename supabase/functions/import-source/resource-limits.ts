import { BodyTooLargeError, readBoundedBody } from "../_shared/bounded-body.ts";

export const MAX_RESPONSE_BYTES = 1_000_000;

export async function readBoundedText(response: Response, signal?: AbortSignal, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  try {
    return await readBoundedBody(response, maxBytes, signal);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new Error("Source response exceeds the 1 MB import limit.");
    throw error;
  }
}
