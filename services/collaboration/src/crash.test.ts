// @vitest-environment node

import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import { appendText, documentText, insertParagraph } from "./test/document";

const childMessage = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), port: z.number().int().positive() }),
  z.object({
    kind: z.literal("persisted"),
    mutationId: z.string().min(1),
    sequence: z.number().int().positive(),
  }),
]);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function startServer(storePath: string, pauseAfterAppend: boolean) {
  const persisted = deferred<{ mutationId: string; sequence: number }>();
  const child = fork(
    fileURLToPath(new URL("./test/crash-server.ts", import.meta.url)),
    [],
    {
      env: {
        ...process.env,
        COLLAB_PAUSE_AFTER_APPEND: String(pauseAfterAppend),
        COLLAB_STORE_PATH: storePath,
      },
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    },
  );

  const port = await new Promise<number>((resolve, reject) => {
    child.on("message", (input) => {
      const message = childMessage.safeParse(input);
      if (!message.success) return;
      if (message.data.kind === "ready") resolve(message.data.port);
      if (message.data.kind === "persisted") {
        persisted.resolve(message.data);
      }
    });
    child.once("exit", (code) => {
      reject(new Error(`Crash server exited before ready with code ${code}`));
    });
  });

  return { child, persisted: persisted.promise, port };
}

async function kill(child: ChildProcess) {
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
}

describe("collaboration crash recovery", () => {
  const cleanup: Array<() => void | Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((dispose) => dispose()));
  });

  it(
    "recovers updates killed after commit before ack and after ack",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "debatelab-collab-"));
      const storePath = join(directory, "updates.jsonl");
      cleanup.push(() => rm(directory, { force: true, recursive: true }));

      const first = await startServer(storePath, true);
      cleanup.push(() => {
        if (!first.child.killed) first.child.kill("SIGKILL");
      });
      const document = new Y.Doc();
      const firstAcks: string[] = [];
      const provider = new HocuspocusProvider({
        document,
        name: "speech-crash@1",
        onStateless: ({ payload }) => firstAcks.push(payload),
        token: "author",
        url: `ws://127.0.0.1:${first.port}`,
      });
      cleanup.push(() => provider.destroy());

      await vi.waitFor(() => expect(provider.isSynced).toBe(true));
      insertParagraph(document, "Survives restart");
      const persisted = await first.persisted;
      expect(firstAcks).toEqual([]);
      await kill(first.child);
      provider.destroy();

      const second = await startServer(storePath, false);
      cleanup.push(() => {
        if (!second.child.killed) second.child.kill("SIGKILL");
      });
      const secondAcks: string[] = [];
      const reconnected = new HocuspocusProvider({
        document,
        name: "speech-crash@1",
        onStateless: ({ payload }) => secondAcks.push(payload),
        token: "author",
        url: `ws://127.0.0.1:${second.port}`,
      });
      cleanup.push(() => reconnected.destroy());

      await vi.waitFor(() => expect(reconnected.isSynced).toBe(true));
      reconnected.sendStateless(
        JSON.stringify({
          epoch: 1,
          kind: "durable-ack-query",
          mutationIds: [persisted.mutationId],
        }),
      );
      await vi.waitFor(() => expect(secondAcks).toHaveLength(1));
      expect(JSON.parse(secondAcks[0]).sequence).toBe(persisted.sequence);

      appendText(document, " After acknowledgement");
      await vi.waitFor(() => expect(secondAcks).toHaveLength(2));
      expect(JSON.parse(secondAcks[1])).toMatchObject({
        kind: "durable-ack",
        sequence: persisted.sequence + 1,
      });
      await kill(second.child);
      reconnected.destroy();

      const third = await startServer(storePath, false);
      cleanup.push(() => {
        if (!third.child.killed) third.child.kill("SIGKILL");
      });
      const freshDocument = new Y.Doc();
      const fresh = new HocuspocusProvider({
        document: freshDocument,
        name: "speech-crash@1",
        token: "author",
        url: `ws://127.0.0.1:${third.port}`,
      });
      cleanup.push(() => fresh.destroy());

      await vi.waitFor(() => {
        expect(fresh.isSynced).toBe(true);
        expect(documentText(freshDocument)).toContain("Survives restart");
        expect(documentText(freshDocument)).toContain("After acknowledgement");
      });
    },
    15_000,
  );
});
