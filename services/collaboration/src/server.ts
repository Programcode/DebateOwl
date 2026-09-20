import { createHash } from "node:crypto";
import { Server, type Connection } from "@hocuspocus/server";
import { Mutex } from "async-mutex";
import {
  messageYjsSyncStep2,
  messageYjsUpdate,
} from "y-protocols/sync";
import * as Y from "yjs";
import { z } from "zod";
import { validateWorkspaceDocument } from "../../../src/lib/workspace/schema";

const MAX_UPDATE_BYTES = 2 * 1024 * 1024;
const MAX_ACK_QUERY_BYTES = 16 * 1024;
const acknowledgementQuery = z.object({
  epoch: z.number().int().nonnegative(),
  kind: z.literal("durable-ack-query"),
  mutationIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{43}$/)).max(100),
});

export interface DurableUpdate {
  authorId: string;
  bytes: Uint8Array;
  documentId: string;
  epoch: number;
  mutationId: string;
  sequence: number;
  syncType: number;
}

export interface DurableUpdateStore {
  append(update: Omit<DurableUpdate, "sequence">): Promise<DurableUpdate>;
  find(
    documentId: string,
    epoch: number,
    mutationId: string,
  ): Promise<DurableUpdate | undefined>;
  load(documentId: string, epoch: number): Promise<DurableUpdate[]>;
}

interface AuthenticatedDocument {
  authorId: string;
  documentId: string;
  epoch: number;
}

interface CollaborationServerOptions {
  authenticate(input: {
    documentName: string;
    token: string;
  }): Promise<AuthenticatedDocument>;
  store: DurableUpdateStore;
}

function sendAcknowledgement(
  connection: Connection<AuthenticatedDocument>,
  update: DurableUpdate,
) {
  connection.sendStateless(
    JSON.stringify({
      epoch: update.epoch,
      kind: "durable-ack",
      mutationId: update.mutationId,
      sequence: update.sequence,
    }),
  );
}

export function createCollaborationServer(
  options: CollaborationServerOptions,
): Server<AuthenticatedDocument> {
  const pending = new WeakMap<
    Connection<AuthenticatedDocument>,
    { durable: DurableUpdate; release: () => void }
  >();
  const locks = new Map<string, Mutex>();

  return new Server<AuthenticatedDocument>({
    address: "127.0.0.1",
    flushDelay: false,
    port: 0,
    quiet: true,
    stopOnSignals: false,
    onAuthenticate: ({ documentName, token }) =>
      options.authenticate({ documentName, token }),
    async onLoadDocument({ context }) {
      const document = new Y.Doc();
      const updates = await options.store.load(context.documentId, context.epoch);
      for (const update of [...updates].sort(
        (a, b) => a.sequence - b.sequence,
      )) {
        Y.applyUpdate(document, update.bytes);
      }
      return document;
    },
    async onStateless({ connection, payload }) {
      if (payload.length > MAX_ACK_QUERY_BYTES) return;
      let input: unknown;
      try {
        input = JSON.parse(payload);
      } catch {
        return;
      }
      const query = acknowledgementQuery.safeParse(input);
      const context = connection.context;
      if (!query.success || query.data.epoch !== context.epoch) return;

      for (const mutationId of query.data.mutationIds) {
        const update = await options.store.find(
          context.documentId,
          context.epoch,
          mutationId,
        );
        if (update?.authorId === context.authorId) {
          sendAcknowledgement(connection, update);
        }
      }
    },
    async beforeSync({ connection, context, document, payload, type }) {
      if (type !== messageYjsSyncStep2 && type !== messageYjsUpdate) return;
      if (payload.byteLength > MAX_UPDATE_BYTES) {
        throw new Error("Collaboration update exceeds 2 MiB");
      }
      const decoded = Y.decodeUpdate(payload);
      if (decoded.structs.length === 0 && decoded.ds.clients.size === 0) return;

      const key = `${context.documentId}@${context.epoch}`;
      const mutex = locks.get(key) ?? new Mutex();
      locks.set(key, mutex);
      const release = await mutex.acquire();
      try {
        const candidate = new Y.Doc();
        try {
          Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
          Y.applyUpdate(candidate, payload);
          validateWorkspaceDocument(candidate);
          if (Y.encodeStateAsUpdate(candidate).byteLength > MAX_UPDATE_BYTES) {
            throw new Error("Collaboration document exceeds spike limit");
          }
        } finally {
          candidate.destroy();
        }

        const mutationId = createHash("sha256")
          .update(payload)
          .digest("base64url");
        const durable = await options.store.append({
          authorId: context.authorId,
          bytes: payload,
          documentId: context.documentId,
          epoch: context.epoch,
          mutationId,
          syncType: type,
        });
        pending.set(connection, { durable, release });
      } catch (error) {
        release();
        if (!mutex.isLocked()) locks.delete(key);
        throw error;
      }
    },
    async afterHandleMessage({ connection, document }) {
      const accepted = pending.get(connection);
      pending.delete(connection);
      if (!accepted) return;
      const key = `${accepted.durable.documentId}@${accepted.durable.epoch}`;
      try {
        if (
          Y.snapshotContainsUpdate(
            Y.snapshot(document),
            accepted.durable.bytes,
          )
        ) {
          sendAcknowledgement(connection, accepted.durable);
        }
      } finally {
        accepted.release();
        const mutex = locks.get(key);
        if (mutex && !mutex.isLocked()) locks.delete(key);
      }
    },
  });
}
