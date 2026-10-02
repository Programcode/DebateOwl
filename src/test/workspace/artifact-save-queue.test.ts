import { describe, expect, it, vi } from "vitest";
import { createArtifactSaveQueue } from "@/lib/workspace/artifact-save-queue";

type Save = { requestId: string; progress: string };

function deferredSaves() {
  const calls: { input: Save; resolve: () => void; reject: (error: Error) => void }[] = [];
  const save = vi.fn((input: Save) => new Promise<string>((resolve, reject) => {
    calls.push({ input, resolve: () => resolve("artifact"), reject });
  }));
  return { calls, save };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createArtifactSaveQueue", () => {
  it("sends one save at a time and only the newest progress after the one in flight", async () => {
    const { calls, save } = deferredSaves();
    const enqueue = createArtifactSaveQueue(save);

    enqueue({ requestId: "round", progress: "a" });
    enqueue({ requestId: "round", progress: "ab" });
    enqueue({ requestId: "round", progress: "abc" });
    expect(save).toHaveBeenCalledTimes(1);

    calls[0].resolve();
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1].input.progress).toBe("abc");

    calls[1].resolve();
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("never lets an older save land after a newer one", async () => {
    const { calls, save } = deferredSaves();
    const enqueue = createArtifactSaveQueue(save);

    enqueue({ requestId: "round", progress: "short" });
    enqueue({ requestId: "round", progress: "longer text" });
    calls[0].resolve();
    await flush();
    calls[1].resolve();
    await flush();

    expect(save.mock.calls.map(([input]) => input.progress)).toEqual(["short", "longer text"]);
  });

  it("keeps the final save of a finished round when the next round starts", async () => {
    const { calls, save } = deferredSaves();
    const enqueue = createArtifactSaveQueue(save);

    enqueue({ requestId: "round-1", progress: "typing" });
    enqueue({ requestId: "round-1", progress: "complete" });
    enqueue({ requestId: "round-2", progress: "setup" });
    calls[0].resolve();
    await flush();
    calls[1].resolve();
    await flush();
    calls[2]?.resolve();
    await flush();

    expect(save.mock.calls.map(([input]) => [input.requestId, input.progress])).toEqual([
      ["round-1", "typing"],
      ["round-1", "complete"],
      ["round-2", "setup"],
    ]);
  });

  it("keeps saving after a failed save without an unhandled rejection", async () => {
    const { calls, save } = deferredSaves();
    const onError = vi.fn();
    const enqueue = createArtifactSaveQueue(save, onError);

    enqueue({ requestId: "round", progress: "a" });
    enqueue({ requestId: "round", progress: "ab" });
    calls[0].reject(new Error("offline"));
    await flush();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1].input.progress).toBe("ab");
  });
});
