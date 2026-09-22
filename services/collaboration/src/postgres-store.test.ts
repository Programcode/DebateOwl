// @vitest-environment node

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { PostgresDurableUpdateStore } from "./postgres-store";
import { serializeProposal, type WorkspaceProposal } from "../../../src/lib/workspace/review";
import { WORKSPACE_CONTENT_FIELD, workspaceSchema } from "../../../src/lib/workspace/schema";

class FakeClient extends EventEmitter {
  readonly query = vi.fn().mockResolvedValue({ rows: [] });
  readonly release = vi.fn();
}

describe("Postgres collaboration writer locks", () => {
  function proposalFixture() {
    const document = prosemirrorJSONToYDoc(workspaceSchema, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    }, WORKSPACE_CONTENT_FIELD);
    const proposal: WorkspaceProposal = {
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      documentEpoch: 3,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      baseStateVector: new Uint8Array(),
      hunks: [{
        absoluteFrom: 7,
        absoluteTo: 12,
        contextAfter: [{ type: "paragraph" }],
        contextBefore: [{ type: "text", text: " " }],
        from: new Uint8Array(),
        id: "replace",
        kind: "format",
        original: [{ type: "text", text: "world" }],
        replacement: [{ type: "text", text: "team" }],
        status: "pending",
        to: new Uint8Array(),
      }],
    };
    const snapshot = Y.encodeStateAsUpdate(document);
    document.destroy();
    return { proposal, snapshot };
  }
  it("holds one session advisory lock and fences writers when that session dies", async () => {
    const client = new FakeClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const store = new PostgresDurableUpdateStore(pool);
    const onLost = vi.fn();

    const release = await store.acquireWriter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      onLost,
    );

    expect(client.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_lock(hashtextextended($1, 0))",
      ["workspace-document:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@3"],
    );

    client.emit("error", new Error("lock connection lost"));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);

    await release();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("destroys the dedicated session when advisory lock acquisition fails", async () => {
    const client = new FakeClient();
    client.query.mockRejectedValueOnce(new Error("database unavailable"));
    const store = new PostgresDurableUpdateStore({ connect: vi.fn().mockResolvedValue(client) });

    await expect(store.acquireWriter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      vi.fn(),
    )).rejects.toThrow("database unavailable");
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it("appends and snapshots only while author membership and epoch are current", async () => {
    const client = new FakeClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const store = new PostgresDurableUpdateStore(pool);
    const release = await store.acquireWriter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      vi.fn(),
    );
    client.query.mockReset();
    client.query.mockImplementation(async (text: string) => {
      if (text.includes("FROM private.workspace_document_state")) {
        return { rows: [{ durable_sequence: 7, workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      if (text.includes("FROM private.workspace_document_updates")) return { rows: [] };
      return { rows: [] };
    });

    const durable = await store.append({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      bytes: new Uint8Array([1, 2]),
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
      mutationId: "a".repeat(43),
      snapshot: new Uint8Array([3, 4]),
      syncType: 2,
    });

    expect(durable.sequence).toBe(8);
    const appendQueries = client.query.mock.calls.map(([text]) => String(text));
    expect(appendQueries.findIndex((text) => text.includes("FOR UPDATE OF workspace")))
      .toBeLessThan(appendQueries.findIndex((text) => text.includes("SELECT state.workspace_id, state.durable_sequence")));
    expect(client.query.mock.calls.some(([text]) => String(text).startsWith("INSERT INTO private.workspace_document_updates"))).toBe(true);
    expect(client.query.mock.calls.some(([text]) => String(text).startsWith("UPDATE private.workspace_document_state"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    await release();
  });

  it("rejects an append when the database membership check fails", async () => {
    const client = new FakeClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const store = new PostgresDurableUpdateStore(pool);
    const release = await store.acquireWriter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      vi.fn(),
    );
    client.query.mockReset();
    client.query.mockResolvedValue({ rows: [] });

    await expect(store.append({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      bytes: new Uint8Array([1, 2]),
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
      mutationId: "b".repeat(43),
      snapshot: new Uint8Array([3, 4]),
      syncType: 2,
    })).rejects.toThrow("Workspace access revoked");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query.mock.calls.some(([text]) => String(text).startsWith("INSERT"))).toBe(false);
    await release();
  });

  it("loads the current snapshot and durable acknowledgement from the writer session", async () => {
    const client = new FakeClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const store = new PostgresDurableUpdateStore(pool);
    const release = await store.acquireWriter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      vi.fn(),
    );
    client.query.mockReset();
    client.query.mockImplementation(async (text: string) => {
      if (text.includes("SELECT snapshot")) {
        return { rows: [{ snapshot: new Uint8Array([9, 8]) }] };
      }
      return {
        rows: [{
          author_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          bytes: new Uint8Array([1, 2]),
          sequence: "7",
          sync_type: 2,
        }],
      };
    });

    await expect(store.loadSnapshot(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
    )).resolves.toEqual(new Uint8Array([9, 8]));
    await expect(store.find(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      "a".repeat(43),
    )).resolves.toMatchObject({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      mutationId: "a".repeat(43),
      sequence: 7,
    });
    await release();
  });

  it("stores one automatic version for the durable sequence after the idle window", async () => {
    const client = new FakeClient();
    client.query.mockImplementation(async (text: string) => ({
      rows: text.includes("SELECT workspace.id AS workspace_id")
        ? [{ workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]
        : [],
    }));
    const store = new PostgresDurableUpdateStore({ connect: vi.fn().mockResolvedValue(client) });
    const release = await store.acquireWriter(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      3,
      vi.fn(),
    );
    client.query.mockClear();

    await store.snapshotVersion("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 3);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.workspace_versions"),
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 3],
    );
    await release();
  });

  it("checks current membership and epoch on a fresh database session", async () => {
    const client = new FakeClient();
    client.query.mockResolvedValueOnce({ rows: [{ allowed: true }] });
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const store = new PostgresDurableUpdateStore(pool);

    await expect(store.isAuthorized({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
    })).resolves.toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("persists accepted content, its pre-decision version, and the decision in one transaction", async () => {
    const { proposal, snapshot } = proposalFixture();
    const client = new FakeClient();
    client.query.mockImplementation(async (text: string) => {
      if (text.includes("SELECT workspace.id AS workspace_id")) {
        return { rows: [{ workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      if (text.includes("SELECT proposal.payload")) {
        return { rows: [{
          durable_sequence: 4,
          payload: serializeProposal(proposal),
          proposal_sequence: 4,
          snapshot,
          workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }] };
      }
      return { rows: [] };
    });
    const store = new PostgresDurableUpdateStore({ connect: vi.fn().mockResolvedValue(client) });

    const result = await store.decideProposal({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      decision: "accepted",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
      hunkId: "replace",
      proposalId: proposal.id,
    });

    expect(result.proposal.hunks[0].status).toBe("accepted");
    expect(result.sequence).toBe(5);
    const decisionQueries = client.query.mock.calls.map(([text]) => String(text));
    expect(decisionQueries.findIndex((text) => text.includes("FOR UPDATE OF workspace")))
      .toBeLessThan(decisionQueries.findIndex((text) => text.includes("FOR UPDATE OF proposal, state")));
    const accepted = new Y.Doc();
    Y.applyUpdate(accepted, snapshot);
    Y.applyUpdate(accepted, result.update!);
    expect(JSON.stringify(yXmlFragmentToProsemirrorJSON(accepted.getXmlFragment(WORKSPACE_CONTENT_FIELD)))).toContain("Hello team");
    accepted.destroy();
    expect(client.query.mock.calls.some(([text]) => String(text).includes("INSERT INTO public.workspace_versions"))).toBe(true);
    expect(client.query.mock.calls.some(([text]) => String(text).includes("INSERT INTO private.workspace_document_updates"))).toBe(true);
    expect(client.query.mock.calls.some(([text]) => String(text).includes("UPDATE public.workspace_proposals"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("durable_sequence = $3"),
      [proposal.id, expect.any(String), 5],
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rolls back accepted content when persisting the decision fails", async () => {
    const { proposal, snapshot } = proposalFixture();
    const client = new FakeClient();
    client.query.mockImplementation(async (text: string) => {
      if (text.includes("SELECT workspace.id AS workspace_id")) {
        return { rows: [{ workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      if (text.includes("SELECT proposal.payload")) {
        return { rows: [{ durable_sequence: 4, payload: serializeProposal(proposal), proposal_sequence: 4, snapshot, workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      if (text.includes("UPDATE public.workspace_proposals")) throw new Error("decision write failed");
      return { rows: [] };
    });
    const store = new PostgresDurableUpdateStore({ connect: vi.fn().mockResolvedValue(client) });

    await expect(store.decideProposal({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      decision: "accepted",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
      hunkId: "replace",
      proposalId: proposal.id,
    })).rejects.toThrow("decision write failed");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
