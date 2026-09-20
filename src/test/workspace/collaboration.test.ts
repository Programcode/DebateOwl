import { HocuspocusProvider } from "@hocuspocus/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createWorkspaceEditor } from "@/lib/workspace/editor-schema";
import {
  createCollaborationServer,
  type DurableUpdate,
  type DurableUpdateStore,
} from "../../../services/collaboration/src/server";

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
    const existing = await this.find(
      update.documentId,
      update.epoch,
      update.mutationId,
    );
    if (existing) return existing;

    const durable = { ...update, sequence: this.updates.length + 1 };
    this.updates.push(durable);
    return durable;
  }
}

describe("workspace editor collaboration", () => {
  const cleanup: Array<() => void | Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((dispose) => dispose()));
  });

  async function createSession() {
    const server = (() => {
      const deno = Object.getOwnPropertyDescriptor(globalThis, "Deno");
      try {
        Reflect.deleteProperty(globalThis, "Deno");
        return createCollaborationServer({
          authenticate: async ({ documentName, token }) => ({
            authorId: token,
            documentId: documentName.split("@")[0],
            epoch: Number(documentName.split("@")[1]),
          }),
          store: new MemoryStore(),
        });
      } finally {
        if (deno) Object.defineProperty(globalThis, "Deno", deno);
      }
    })();
    await server.listen();

    const leftDocument = new Y.Doc();
    const rightDocument = new Y.Doc();
    const left = createWorkspaceEditor(leftDocument);
    const right = createWorkspaceEditor(rightDocument);
    const url = `ws://127.0.0.1:${server.address.port}`;
    const leftProvider = new HocuspocusProvider({
      document: leftDocument,
      name: "structured-editor@1",
      token: "left",
      url,
    });
    const rightProvider = new HocuspocusProvider({
      document: rightDocument,
      name: "structured-editor@1",
      token: "right",
      url,
    });
    cleanup.push(
      () => leftProvider.destroy(),
      () => rightProvider.destroy(),
      () => left.destroy(),
      () => right.destroy(),
      () => leftDocument.destroy(),
      () => rightDocument.destroy(),
      () => server.destroy(),
    );

    await vi.waitFor(() => {
      expect(leftProvider.isSynced).toBe(true);
      expect(rightProvider.isSynced).toBe(true);
    });

    return { left, leftProvider, right, rightProvider };
  }

  it("converges structured paragraph, list, and link edits after reconnect", async () => {
    const { left, leftProvider, right, rightProvider } = await createSession();

    left.commands.setContent("<p>Opening claim</p><p>Evidence</p>");
    await vi.waitFor(() => expect(right.getJSON()).toEqual(left.getJSON()));

    rightProvider.disconnect();
    await vi.waitFor(() => expect(rightProvider.isSynced).toBe(false));

    left.commands.insertContentAt(
      left.state.doc.content.size,
      "<p>Concurrent rebuttal</p>",
    );
    right.commands.insertContentAt(1, "Offline ");
    right.commands.selectAll();
    expect(right.commands.toggleBulletList()).toBe(true);
    right.commands.selectAll();
    expect(
      right.commands.setLink({ href: "https://example.com/evidence" }),
    ).toBe(true);

    rightProvider.connect();
    await vi.waitFor(() => {
      expect(leftProvider.isSynced).toBe(true);
      expect(rightProvider.isSynced).toBe(true);
      expect(right.getJSON()).toEqual(left.getJSON());
    });

    const json = JSON.stringify(left.getJSON());
    expect(json).toContain('"type":"paragraph"');
    expect(json).toContain('"type":"bulletList"');
    expect(json).toContain('"type":"link"');
    expect(json).toContain("Offline Opening claim");
    expect(json).toContain("Concurrent rebuttal");
  });

  it("undoes only the current editor's last change through the provider", async () => {
    const { left, right } = await createSession();

    left.commands.setContent("<p>Base</p>");
    await vi.waitFor(() => expect(right.getJSON()).toEqual(left.getJSON()));
    left.commands.insertContentAt(5, " Alice");
    await vi.waitFor(() => expect(right.getText()).toContain("Alice"));
    right.commands.insertContentAt(11, " Bob");
    await vi.waitFor(() => expect(left.getText()).toContain("Bob"));

    expect(left.commands.undo()).toBe(true);
    await vi.waitFor(() => expect(right.getJSON()).toEqual(left.getJSON()));

    expect(left.getText()).toContain("Bob");
    expect(left.getText()).not.toContain("Alice");
  });
});
