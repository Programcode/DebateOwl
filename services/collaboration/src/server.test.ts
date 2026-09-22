// @vitest-environment node

import { HocuspocusProvider } from "@hocuspocus/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  createCollaborationServer,
  type DurableUpdate,
  type DurableUpdateStore,
} from "./server";
import { createWorkspaceAuthenticator } from "./auth";
import { appendText, documentText, insertParagraph } from "./test/document";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

class BlockingStore implements DurableUpdateStore {
  readonly appendStarted = deferred();
  readonly releaseAppend = deferred();
  readonly updates: DurableUpdate[] = [];

  async load() {
    return this.updates;
  }

  async find(documentId: string, epoch: number, mutationId: string) {
    return this.updates.find(
      (update) =>
        update.documentId === documentId &&
        update.epoch === epoch &&
        update.mutationId === mutationId,
    );
  }

  async append(update: Omit<DurableUpdate, "sequence">) {
    this.appendStarted.resolve();
    await this.releaseAppend.promise;

    const existing = this.updates.find(
      (existingUpdate) =>
        existingUpdate.documentId === update.documentId &&
        existingUpdate.epoch === update.epoch &&
        existingUpdate.mutationId === update.mutationId,
    );
    if (existing) return existing;

    const durable = { ...update, sequence: this.updates.length + 1 };
    this.updates.push(durable);
    return durable;
  }
}

class MemoryStore implements DurableUpdateStore {
  readonly updates: DurableUpdate[] = [];

  async load(documentId: string, epoch: number) {
    return this.updates.filter(
      (update) =>
        update.documentId === documentId && update.epoch === epoch,
    );
  }

  async find(documentId: string, epoch: number, mutationId: string) {
    return this.updates.find(
      (update) =>
        update.documentId === documentId &&
        update.epoch === epoch &&
        update.mutationId === mutationId,
    );
  }

  async append(update: Omit<DurableUpdate, "sequence">) {
    const existing = this.updates.find(
      (existingUpdate) =>
        existingUpdate.documentId === update.documentId &&
        existingUpdate.epoch === update.epoch &&
        existingUpdate.mutationId === update.mutationId,
    );
    if (existing) return existing;

    const sequence = Math.max(
      0,
      ...this.updates
        .filter(
          (existingUpdate) =>
            existingUpdate.documentId === update.documentId &&
            existingUpdate.epoch === update.epoch,
        )
        .map(({ sequence }) => sequence),
    );
    const durable = { ...update, sequence: sequence + 1 };
    this.updates.push(durable);
    return durable;
  }
}

describe("collaboration durability", () => {
  const cleanup: Array<() => void | Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((dispose) => dispose()));
  });

  it("rejects a second provider using a noncanonical alias for an open room", async () => {
    const server = createCollaborationServer({
      authenticate: createWorkspaceAuthenticator({
        isAuthorized: async () => true,
        verifyToken: async (token) => ({
          id: token === "author"
            ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
            : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        }),
      }),
      store: new MemoryStore(),
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const canonical = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@1",
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    let aliasRejected = false;
    const alias = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA@01",
      onAuthenticationFailed: () => { aliasRejected = true; },
      token: "peer",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => canonical.destroy(), () => alias.destroy());

    await vi.waitFor(() => expect(canonical.isSynced).toBe(true));
    await vi.waitFor(() => expect(aliasRejected).toBe(true));
    expect(alias.isSynced).toBe(false);
  });

  it("does not broadcast or acknowledge an update before append commits", async () => {
    const store = new BlockingStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const url = `ws://127.0.0.1:${server.address.port}`;
    const documentName = "speech-1@1";
    const peerDocument = new Y.Doc();
    const authorDocument = new Y.Doc();
    const acknowledgements: string[] = [];
    const peer = new HocuspocusProvider({
      document: peerDocument,
      name: documentName,
      token: "peer",
      url,
    });
    const author = new HocuspocusProvider({
      document: authorDocument,
      name: documentName,
      onStateless: ({ payload }) => acknowledgements.push(payload),
      token: "author",
      url,
    });
    cleanup.push(() => peer.destroy(), () => author.destroy());

    await vi.waitFor(() => {
      expect(peer.isSynced).toBe(true);
      expect(author.isSynced).toBe(true);
    });

    insertParagraph(authorDocument, "Durable claim");
    await store.appendStarted.promise;

    expect(documentText(peerDocument)).toBe("");
    expect(acknowledgements).toEqual([]);

    store.releaseAppend.resolve();

    await vi.waitFor(() => {
      expect(documentText(peerDocument)).toContain("Durable claim");
      expect(acknowledgements).toHaveLength(1);
    });

    expect(JSON.parse(acknowledgements[0])).toMatchObject({
      epoch: 1,
      kind: "durable-ack",
      sequence: 1,
    });
  });

  it("acknowledges member removal only after queued writes are fenced and sockets close", async () => {
    const store = new BlockingStore();
    const changeAccess = vi.fn().mockResolvedValue(4);
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      changeAccess,
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const document = new Y.Doc();
    let closed = 0;
    const provider = new HocuspocusProvider({
      document,
      name: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@1",
      onClose: () => { closed += 1; },
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => provider.destroy(), () => document.destroy());
    await vi.waitFor(() => expect(provider.isSynced).toBe(true));

    insertParagraph(document, "Queued claim");
    await store.appendStarted.promise;
    const removal = fetch(`http://127.0.0.1:${server.address.port}/access/remove`, {
      body: JSON.stringify({
        expectedRevision: 3,
        requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        targetUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
      headers: {
        Authorization: "Bearer owner-token",
        "Content-Type": "application/json",
        Origin: "https://trial.test",
      },
      method: "POST",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(changeAccess).not.toHaveBeenCalled();

    store.releaseAppend.resolve();
    const response = await removal;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revision: 4 });
    expect(changeAccess).toHaveBeenCalledWith({
      expectedRevision: 3,
      requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      targetUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      token: "owner-token",
      workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    await vi.waitFor(() => expect(closed).toBeGreaterThan(0));
  });

  it("persists reconnect SyncStep2 and live Update messages through one gate", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const document = new Y.Doc();
    insertParagraph(document, "Offline");
    const acknowledgements: string[] = [];
    const provider = new HocuspocusProvider({
      document,
      name: "speech-2@1",
      onStateless: ({ payload }) => acknowledgements.push(payload),
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => provider.destroy());

    await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
    expect(store.updates[0].syncType).toBe(1);

    appendText(document, " edit");

    await vi.waitFor(() => expect(acknowledgements).toHaveLength(2));
    expect(store.updates[1].syncType).toBe(2);
  });

  it("allows an archived workspace to complete a read-only reconnect", async () => {
    const store = new MemoryStore();
    const authorize = vi.fn(async (_context: unknown, operation: "awareness" | "read" | "write") => operation !== "write");
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      authorize,
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      document,
      name: "archived-speech@1",
      token: "archived-member",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => provider.destroy(), () => document.destroy());

    await vi.waitFor(() => expect(provider.isSynced).toBe(true));
    expect(store.updates).toHaveLength(0);
    expect(authorize.mock.calls.some(([, operation]) => operation === "write")).toBe(false);
  });

  it("deduplicates identical update bytes within each document and epoch scope", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    for (const [scopeIndex, name] of [
      "speech-a@1",
      "speech-b@1",
      "speech-a@2",
    ].entries()) {
      const document = new Y.Doc();
      const acknowledgements: string[] = [];
      let updateMessage: Uint8Array | undefined;
      const provider = new HocuspocusProvider({
        document,
        name,
        onOutgoingMessage: ({ message }) => {
          if (message.description === "A document update") {
            updateMessage = message.toUint8Array();
          }
        },
        onStateless: ({ payload }) => acknowledgements.push(payload),
        token: "author",
        url: `ws://127.0.0.1:${server.address.port}`,
      });
      cleanup.push(() => provider.destroy(), () => document.destroy());

      await vi.waitFor(() => expect(provider.isSynced).toBe(true));
      document.clientID = 1_234_567;
      insertParagraph(document, "Identical update");
      await vi.waitFor(() => expect(updateMessage).toBeDefined());
      await vi.waitFor(() =>
        expect(store.updates).toHaveLength(scopeIndex + 1),
      );
      await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
      if (!updateMessage) {
        throw new Error("Expected an outbound update message");
      }
      expect(store.updates[scopeIndex].bytes).toEqual(store.updates[0].bytes);

      provider.configuration.websocketProvider.send(updateMessage);
      await vi.waitFor(() => expect(acknowledgements).toHaveLength(2));

      const original = JSON.parse(acknowledgements[0]);
      const retry = JSON.parse(acknowledgements[1]);
      expect(original.sequence).toBe(1);
      expect(retry.sequence).toBe(original.sequence);
    }

    expect(
      store.updates.map(({ documentId, epoch, sequence }) => ({
        documentId,
        epoch,
        sequence,
      })),
    ).toEqual([
      { documentId: "speech-a", epoch: 1, sequence: 1 },
      { documentId: "speech-b", epoch: 1, sequence: 1 },
      { documentId: "speech-a", epoch: 2, sequence: 1 },
    ]);
  });

  it("does not apply, broadcast, or acknowledge an update when append fails", async () => {
    const appendAttempted = deferred();
    const store: DurableUpdateStore = {
      load: async () => [],
      find: async () => undefined,
      append: async () => {
        appendAttempted.resolve();
        throw new Error("database unavailable");
      },
    };
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const peerDocument = new Y.Doc();
    const authorDocument = new Y.Doc();
    const acknowledgements: string[] = [];
    const peer = new HocuspocusProvider({
      document: peerDocument,
      name: "speech-4@1",
      token: "peer",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const author = new HocuspocusProvider({
      document: authorDocument,
      name: "speech-4@1",
      onStateless: ({ payload }) => acknowledgements.push(payload),
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanup.push(
      () => peer.destroy(),
      () => author.destroy(),
      () => errorLog.mockRestore(),
    );

    await vi.waitFor(() => {
      expect(peer.isSynced).toBe(true);
      expect(author.isSynced).toBe(true);
    });
    insertParagraph(authorDocument, "Rejected");
    await appendAttempted.promise;
    await vi.waitFor(() => expect(author.isSynced).toBe(false));

    expect(documentText(peerDocument)).toBe("");
    expect(acknowledgements).toEqual([]);
  });

  it("replays a durable acknowledgement requested after reconnect", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const acknowledgements: string[] = [];
    const provider = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "speech-5@1",
      onStateless: ({ payload }) => acknowledgements.push(payload),
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => provider.destroy());

    await vi.waitFor(() => expect(provider.isSynced).toBe(true));
    insertParagraph(provider.document, "Persisted");
    await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
    const original = JSON.parse(acknowledgements[0]);
    acknowledgements.length = 0;

    provider.sendStateless(
      JSON.stringify({
        epoch: 1,
        kind: "durable-ack-query",
        mutationIds: [original.mutationId],
      }),
    );

    await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
    expect(JSON.parse(acknowledgements[0])).toEqual(original);
  });

  it("rejects an old epoch while leaving its local draft recoverable", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => {
        const epoch = Number(documentName.split("@")[1]);
        if (epoch !== 2) throw new Error("stale epoch");
        return {
          authorId: token,
          documentId: documentName.split("@")[0],
          epoch,
        };
      },
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const oldDocument = new Y.Doc();
    insertParagraph(oldDocument, "Offline recovery draft");
    const rejected = deferred();
    const oldProvider = new HocuspocusProvider({
      document: oldDocument,
      name: "speech-6@1",
      onAuthenticationFailed: () => rejected.resolve(),
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => oldProvider.destroy());
    await rejected.promise;

    const restoredDocument = new Y.Doc();
    const restoredProvider = new HocuspocusProvider({
      document: restoredDocument,
      name: "speech-6@2",
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => restoredProvider.destroy());
    await vi.waitFor(() => expect(restoredProvider.isSynced).toBe(true));

    expect(documentText(oldDocument)).toContain("Offline recovery draft");
    expect(documentText(restoredDocument)).toBe("");
    expect(store.updates).toEqual([]);
  });

  it("rejects updates outside the workspace editor schema", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const document = new Y.Doc();
    const acknowledgements: string[] = [];
    const provider = new HocuspocusProvider({
      document,
      name: "speech-7@1",
      onStateless: ({ payload }) => acknowledgements.push(payload),
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanup.push(() => provider.destroy(), () => errorLog.mockRestore());

    await vi.waitFor(() => expect(provider.isSynced).toBe(true));
    document.getMap("unexpected").set("payload", "not editor content");
    await vi.waitFor(() => expect(provider.isSynced).toBe(false));

    expect(store.updates).toEqual([]);
    expect(acknowledgements).toEqual([]);
  });

  it("serializes concurrent writers for one document", async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    let calls = 0;
    let secondStarted = false;
    const updates: DurableUpdate[] = [];
    cleanup.push(() => {
      releaseFirst.resolve();
      releaseSecond.resolve();
    });
    const store: DurableUpdateStore = {
      load: async () => updates,
      find: async () => undefined,
      append: async (update) => {
        calls += 1;
        if (calls === 1) {
          firstStarted.resolve();
          await releaseFirst.promise;
        } else {
          secondStarted = true;
          await releaseSecond.promise;
        }
        const durable = { ...update, sequence: calls };
        updates.push(durable);
        return durable;
      },
    };
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const leftDocument = new Y.Doc();
    const rightDocument = new Y.Doc();
    const left = new HocuspocusProvider({
      document: leftDocument,
      name: "speech-8@1",
      token: "left",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const right = new HocuspocusProvider({
      document: rightDocument,
      name: "speech-8@1",
      token: "right",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => left.destroy(), () => right.destroy());
    await vi.waitFor(() => {
      expect(left.isSynced).toBe(true);
      expect(right.isSynced).toBe(true);
    });

    insertParagraph(leftDocument, "Left");
    insertParagraph(rightDocument, "Right");
    await firstStarted.promise;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondStarted).toBe(false);

    releaseFirst.resolve();
    await vi.waitFor(() => expect(secondStarted).toBe(true));
    releaseSecond.resolve();
    await vi.waitFor(() => expect(updates).toHaveLength(2));
    expect(updates.map(({ sequence }) => sequence)).toEqual([1, 2]);
  });

  it("rejects an update larger than 2 MiB before append", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const document = new Y.Doc();
    const acknowledgements: string[] = [];
    const provider = new HocuspocusProvider({
      document,
      name: "speech-9@1",
      onStateless: ({ payload }) => acknowledgements.push(payload),
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanup.push(() => provider.destroy(), () => errorLog.mockRestore());

    await vi.waitFor(() => expect(provider.isSynced).toBe(true));
    insertParagraph(document, "x".repeat(2 * 1024 * 1024));
    await vi.waitFor(() => expect(provider.isSynced).toBe(false), {
      timeout: 5_000,
    });

    expect(store.updates).toEqual([]);
    expect(acknowledgements).toEqual([]);
  });

  it("rechecks membership before accepting a document update", async () => {
    const store = new MemoryStore();
    let currentMember = true;
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      authorize: async () => currentMember,
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const authorDocument = new Y.Doc();
    const peerDocument = new Y.Doc();
    const author = new HocuspocusProvider({
      document: authorDocument,
      name: "speech-revoked@1",
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const peer = new HocuspocusProvider({
      document: peerDocument,
      name: "speech-revoked@1",
      token: "peer",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanup.push(() => author.destroy(), () => peer.destroy(), () => errorLog.mockRestore());

    await vi.waitFor(() => {
      expect(author.isSynced).toBe(true);
      expect(peer.isSynced).toBe(true);
    });
    currentMember = false;
    insertParagraph(authorDocument, "Blocked after removal");

    await vi.waitFor(() => expect(author.isSynced).toBe(false));
    expect(documentText(peerDocument)).toBe("");
    expect(store.updates).toEqual([]);
  });

  it("rechecks membership before broadcasting awareness", async () => {
    const store = new MemoryStore();
    let currentMember = true;
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      authorize: async () => currentMember,
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const author = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "speech-awareness@1",
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const peer = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "speech-awareness@1",
      token: "peer",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanup.push(() => author.destroy(), () => peer.destroy(), () => errorLog.mockRestore());

    await vi.waitFor(() => {
      expect(author.isSynced).toBe(true);
      expect(peer.isSynced).toBe(true);
    });
    currentMember = false;
    author.setAwarenessField("user", { name: "Removed member" });

    await vi.waitFor(() => expect(author.isSynced).toBe(false));
    expect(
      [...(peer.awareness?.getStates().values() ?? [])]
        .some((state) => state.user?.name === "Removed member"),
    ).toBe(false);
  });

  it("closes every writer when the dedicated database lock session dies", async () => {
    const memory = new MemoryStore();
    const released = vi.fn();
    let loseLock: (() => void) | undefined;
    const store = {
      append: memory.append.bind(memory),
      find: memory.find.bind(memory),
      load: memory.load.bind(memory),
      acquireWriter: vi.fn(async (_documentId: string, _epoch: number, onLost: () => void) => {
        loseLock = onLost;
        return released;
      }),
    };
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const provider = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "speech-lock-loss@4",
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => provider.destroy());

    await vi.waitFor(() => expect(provider.isSynced).toBe(true));
    expect(store.acquireWriter).toHaveBeenCalledWith(
      "speech-lock-loss",
      4,
      expect.any(Function),
    );
    loseLock?.();

    await vi.waitFor(() => expect(provider.isSynced).toBe(false));
  });

  it("replaces forged cursor identity with the authenticated label", async () => {
    const store = new MemoryStore();
    const server = createCollaborationServer({
      authenticate: async ({ documentName, token }) => ({
        authorId: token,
        displayName: "Authenticated author",
        documentId: documentName.split("@")[0],
        epoch: Number(documentName.split("@")[1]),
      }),
      store,
    });
    await server.listen();
    cleanup.push(() => server.destroy());

    const author = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "speech-cursor-label@1",
      token: "author",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const peer = new HocuspocusProvider({
      document: new Y.Doc(),
      name: "speech-cursor-label@1",
      token: "peer",
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    cleanup.push(() => author.destroy(), () => peer.destroy());

    await vi.waitFor(() => {
      expect(author.isSynced).toBe(true);
      expect(peer.isSynced).toBe(true);
    });
    author.setAwarenessField("user", { id: "victim", name: "Forged name" });

    await vi.waitFor(() => {
      expect([...(peer.awareness?.getStates().values() ?? [])]).toContainEqual(
        expect.objectContaining({
          user: expect.objectContaining({ id: "author", name: "Authenticated author" }),
        }),
      );
    });
  });
});
