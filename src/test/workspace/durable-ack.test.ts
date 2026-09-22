import { createEncoder, toUint8Array, writeVarString, writeVarUint } from "lib0/encoding";
import { writeUpdate } from "y-protocols/sync";
import { describe, expect, it } from "vitest";
import { durableMutationFromMessage } from "@/lib/workspace/durable-ack";

describe("workspace durable acknowledgements", () => {
  it("hashes the exact Yjs payload sent in a live update message", async () => {
    const encoder = createEncoder();
    writeVarString(encoder, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@3");
    writeVarUint(encoder, 0);
    writeUpdate(encoder, new Uint8Array([1, 2, 3]));

    await expect(durableMutationFromMessage(toUint8Array(encoder))).resolves.toMatchObject({
      mutationId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      syncType: 2,
    });
  });

  it("ignores non-write sync messages", async () => {
    const encoder = createEncoder();
    writeVarString(encoder, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@3");
    writeVarUint(encoder, 0);
    writeVarUint(encoder, 0);

    await expect(durableMutationFromMessage(toUint8Array(encoder))).resolves.toBeNull();
  });
});
