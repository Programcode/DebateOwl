import { open, readFile } from "node:fs/promises";
import { z } from "zod";
import {
  createCollaborationServer,
  type DurableUpdate,
  type DurableUpdateStore,
} from "../server";

const storedUpdate = z.object({
  authorId: z.string(),
  bytes: z.string(),
  documentId: z.string(),
  epoch: z.number().int(),
  mutationId: z.string(),
  sequence: z.number().int(),
  syncType: z.number().int(),
});

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

class FileUpdateStore implements DurableUpdateStore {
  constructor(
    private readonly path: string,
    private readonly pauseAfterAppend: boolean,
  ) {}

  private async read(): Promise<DurableUpdate[]> {
    let contents: string;
    try {
      contents = await readFile(this.path, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }

    return contents
      .split("\n")
      .filter(Boolean)
      .map((line) => storedUpdate.parse(JSON.parse(line)))
      .map((update) => ({
        ...update,
        bytes: Uint8Array.from(Buffer.from(update.bytes, "base64")),
      }));
  }

  async load(documentId: string, epoch: number) {
    return (await this.read()).filter(
      (update) =>
        update.documentId === documentId && update.epoch === epoch,
    );
  }

  async find(documentId: string, epoch: number, mutationId: string) {
    return (await this.read()).find(
      (update) =>
        update.documentId === documentId &&
        update.epoch === epoch &&
        update.mutationId === mutationId,
    );
  }

  async append(update: Omit<DurableUpdate, "sequence">) {
    const existing = await this.find(
      update.documentId,
      update.epoch,
      update.mutationId,
    );
    if (existing) return existing;

    const current = await this.load(update.documentId, update.epoch);
    const durable = {
      ...update,
      sequence: Math.max(0, ...current.map(({ sequence }) => sequence)) + 1,
    };
    const file = await open(this.path, "a");
    try {
      await file.appendFile(
        `${JSON.stringify({
          ...durable,
          bytes: Buffer.from(durable.bytes).toString("base64"),
        })}\n`,
      );
      await file.sync();
    } finally {
      await file.close();
    }

    process.send?.({
      kind: "persisted",
      mutationId: durable.mutationId,
      sequence: durable.sequence,
    });
    if (this.pauseAfterAppend) {
      await new Promise<never>(() => undefined);
    }
    return durable;
  }
}

const storePath = process.env.COLLAB_STORE_PATH;
if (!storePath) throw new Error("COLLAB_STORE_PATH is required");

const store = new FileUpdateStore(
  storePath,
  process.env.COLLAB_PAUSE_AFTER_APPEND === "true",
);
const server = createCollaborationServer({
  authenticate: async ({ documentName, token }) => {
    const separator = documentName.lastIndexOf("@");
    const documentId = documentName.slice(0, separator);
    const epoch = Number(documentName.slice(separator + 1));
    if (!documentId || !Number.isInteger(epoch) || epoch < 0) {
      throw new Error("Invalid document identity");
    }
    return { authorId: token, documentId, epoch };
  },
  store,
});

await server.listen();
process.send?.({ kind: "ready", port: server.address.port });
