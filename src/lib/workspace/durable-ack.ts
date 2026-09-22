import { createDecoder, readVarString, readVarUint, readVarUint8Array } from "lib0/decoding";

export async function durableMutationFromMessage(message: Uint8Array) {
  const decoder = createDecoder(message);
  readVarString(decoder);
  if (readVarUint(decoder) !== 0) return null;
  const syncType = readVarUint(decoder);
  if (syncType !== 1 && syncType !== 2) return null;

  const payload = readVarUint8Array(decoder);
  const digestInput = new Uint8Array(payload.byteLength);
  digestInput.set(payload);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput));
  const mutationId = btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return { mutationId, syncType };
}
