import { describe, expect, it } from "vitest";
import { durableMutationFromMessage } from "@/lib/workspace/durable-ack";

describe("workspace durable acknowledgements", () => {
  // Hocuspocus passes empty outgoing messages to onOutgoingMessage; decoding one
  // threw "Unexpected end of array" as an uncaught page error in the workspace editor.
  it("ignores the empty messages the provider reports as outgoing", async () => {
    await expect(durableMutationFromMessage(new Uint8Array())).resolves.toBeNull();
  });
});
