import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
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

export interface DurableAppend extends Omit<DurableUpdate, "sequence"> {
  snapshot: Uint8Array;
}

export interface DurableUpdateStore {
  append(update: DurableAppend): Promise<DurableUpdate>;
  find(
    documentId: string,
    epoch: number,
    mutationId: string,
  ): Promise<DurableUpdate | undefined>;
  load(documentId: string, epoch: number): Promise<DurableUpdate[]>;
  acquireWriter?(
    documentId: string,
    epoch: number,
    onLost: () => void,
  ): Promise<() => void | Promise<void>>;
  loadSnapshot?(documentId: string, epoch: number): Promise<Uint8Array | undefined>;
  snapshotVersion?(documentId: string, epoch: number): Promise<void>;
}

interface AuthenticatedDocument {
  authorId: string;
  displayName?: string;
  documentId: string;
  epoch: number;
}

interface CollaborationServerOptions {
  changeAccess?(input: {
    expectedRevision: number;
    requestId: string;
    targetUserId: string;
    token: string;
    workspaceId: string;
  }): Promise<number>;
  decideProposal?(input: {
    decision: "accepted" | "rejected";
    documentId: string;
    epoch: number;
    hunkId: string;
    proposalId: string;
    token: string;
  }): Promise<{ proposal: unknown; sequence: number; update?: Uint8Array }>;
  authenticate(input: {
    documentName: string;
    token: string;
  }): Promise<AuthenticatedDocument>;
  allowedOrigins?: ReadonlySet<string>;
  authorize?(
    context: AuthenticatedDocument,
    operation: "awareness" | "read" | "write",
  ): Promise<boolean>;
  store: DurableUpdateStore;
}

const accessChangeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});
const proposalDecisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  documentId: z.string().uuid(),
  epoch: z.number().int().nonnegative(),
  hunkId: z.string().min(1).max(100),
  proposalId: z.string().uuid(),
});

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 16 * 1024) throw new Error("Request too large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown, origin?: string) {
  response.writeHead(status, {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
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
  const writerReleases = new Map<string, () => void | Promise<void>>();
  // ponytail: one process-wide fence keeps removal ordering obvious; scope per workspace if trial traffic warrants it.
  const accessFence = new Mutex();
  const authorize = options.authorize ?? (async () => true);

  const server = new Server<AuthenticatedDocument>({
    address: "127.0.0.1",
    debounce: 3_000,
    flushDelay: false,
    maxDebounce: 30_000,
    port: 0,
    quiet: true,
    stopOnSignals: false,
    async onConnect({ requestHeaders }) {
      if (options.allowedOrigins?.size) {
        const origin = requestHeaders.get("origin");
        if (!origin || !options.allowedOrigins.has(origin)) {
          throw new Error("Origin unavailable");
        }
      }
    },
    onAuthenticate: ({ documentName, token }) =>
      options.authenticate({ documentName, token }),
    async onLoadDocument({ context, documentName }) {
      if (options.store.acquireWriter && !writerReleases.has(documentName)) {
        const release = await options.store.acquireWriter(
          context.documentId,
          context.epoch,
          () => {
            writerReleases.delete(documentName);
            server.hocuspocus.closeConnections(documentName);
          },
        );
        writerReleases.set(documentName, release);
      }

      const document = new Y.Doc();
      try {
        const snapshot = await options.store.loadSnapshot?.(context.documentId, context.epoch);
        if (snapshot?.byteLength) {
          Y.applyUpdate(document, snapshot);
        } else {
          const updates = await options.store.load(context.documentId, context.epoch);
          for (const update of [...updates].sort(
            (a, b) => a.sequence - b.sequence,
          )) {
            Y.applyUpdate(document, update.bytes);
          }
        }
        return document;
      } catch (error) {
        const release = writerReleases.get(documentName);
        writerReleases.delete(documentName);
        await release?.();
        throw error;
      }
    },
    async onStateless({ connection, payload }) {
      if (!await authorize(connection.context, "read")) throw new Error("Workspace access revoked");
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
    async beforeHandleAwareness({ connection, context, states }) {
      if (connection && context && !await authorize(context, "awareness")) {
        throw new Error("Workspace access revoked");
      }
      if (context) {
        states.forEach((state) => {
          const color = typeof state.user?.color === "string" ? state.user.color : undefined;
          state.user = {
            ...(color ? { color } : {}),
            id: context.authorId,
            name: context.displayName ?? `Member ${context.authorId.slice(0, 4)}`,
          };
        });
      }
    },
    async beforeSync({ connection, context, document, payload, type }) {
      if (!await authorize(context, "read")) throw new Error("Workspace access revoked");
      const isUpdate = type === messageYjsSyncStep2 || type === messageYjsUpdate;
      if (!isUpdate) return;
      if (payload.byteLength > MAX_UPDATE_BYTES) {
        throw new Error("Collaboration update exceeds 2 MiB");
      }
      const decoded = Y.decodeUpdate(payload);
      if (decoded.structs.length === 0 && decoded.ds.clients.size === 0) return;
      const mutationId = createHash("sha256").update(payload).digest("base64url");
      const probe = new Y.Doc();
      try {
        Y.applyUpdate(probe, Y.encodeStateAsUpdate(document));
        const before = Y.encodeStateAsUpdate(probe);
        Y.applyUpdate(probe, payload);
        const after = Y.encodeStateAsUpdate(probe);
        if (Buffer.from(before).equals(Buffer.from(after))) {
          const duplicate = await options.store.find(context.documentId, context.epoch, mutationId);
          if (duplicate?.authorId === context.authorId) sendAcknowledgement(connection, duplicate);
          return;
        }
      } finally {
        probe.destroy();
      }
      if (!await authorize(context, "write")) throw new Error("Workspace access revoked");

      const releaseAccess = await accessFence.acquire();
      const key = `${context.documentId}@${context.epoch}`;
      const mutex = locks.get(key) ?? new Mutex();
      locks.set(key, mutex);
      const release = await mutex.acquire();
      try {
        const candidate = new Y.Doc();
        let snapshot: Uint8Array;
        try {
          Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
          Y.applyUpdate(candidate, payload);
          validateWorkspaceDocument(candidate);
          snapshot = Y.encodeStateAsUpdate(candidate);
          if (snapshot.byteLength > MAX_UPDATE_BYTES) {
            throw new Error("Collaboration document exceeds spike limit");
          }
        } finally {
          candidate.destroy();
        }

        const durable = await options.store.append({
          authorId: context.authorId,
          bytes: payload,
          documentId: context.documentId,
          epoch: context.epoch,
          mutationId,
          snapshot,
          syncType: type,
        });
        pending.set(connection, { durable, release: () => {
          release();
          releaseAccess();
        } });
      } catch (error) {
        release();
        releaseAccess();
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
    async onStoreDocument({ documentName }) {
      const [documentId, epoch] = documentName.split("@");
      await options.store.snapshotVersion?.(documentId, Number(epoch));
    },
    async onRequest({ instance, request, response }) {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/access/remove" && url.pathname !== "/review/decide") return;
      const origin = request.headers.origin;
      if (options.allowedOrigins?.size && (!origin || !options.allowedOrigins.has(origin))) {
        json(response, 403, { error: "Origin unavailable" });
        throw null;
      }
      if (request.method === "OPTIONS") {
        json(response, 204, null, origin);
        throw null;
      }
      if (request.method !== "POST") {
        json(response, 405, { error: "Method unavailable" }, origin);
        throw null;
      }
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
      try {
        if (!token) throw new Error("Authentication required");
        const body = await requestBody(request);
        const release = await accessFence.acquire();
        try {
          if (url.pathname === "/access/remove") {
            if (!options.changeAccess) throw new Error("Method unavailable");
            const revision = await options.changeAccess({ ...accessChangeSchema.parse(body), token });
            instance.closeConnections();
            json(response, 200, { revision }, origin);
          } else {
            if (!options.decideProposal) throw new Error("Method unavailable");
            const input = proposalDecisionSchema.parse(body);
            const result = await options.decideProposal({ ...input, token });
            if (result.update) {
              const documentName = `${input.documentId}@${input.epoch}`;
              const direct = await instance.openDirectConnection(documentName);
              try {
                await direct.transact((document) => Y.applyUpdate(document, result.update!));
              } catch {
                instance.closeConnections(documentName);
              } finally {
                await direct.disconnect();
              }
            }
            json(response, 200, { proposal: result.proposal, sequence: result.sequence }, origin);
          }
        } finally {
          release();
        }
      } catch {
        json(response, 403, { error: "Workspace unavailable" }, origin);
      }
      throw null;
    },
    async onDisconnect({ clientsCount, documentName }) {
      if (clientsCount > 0) return;
      const release = writerReleases.get(documentName);
      writerReleases.delete(documentName);
      await release?.();
    },
  });

  return server;
}
