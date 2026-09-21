import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { isWorkspaceMember, loadAuthorizedWorkspaceContext } from "./workspace-context.ts";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const documentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const requestId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

class Query {
  constructor(private readonly value: () => { data: unknown; error: null }) {}
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  single() { return Promise.resolve(this.value()); }
  maybeSingle() { return Promise.resolve(this.value()); }
  then(resolve: (value: { data: unknown; error: null }) => unknown) { return Promise.resolve(this.value()).then(resolve); }
}

function database({ member = true, sources = 1 }: { member?: boolean; sources?: number } = {}) {
  return {
    from(table: string) {
      return new Query(() => ({
        data: table === "workspaces"
          ? { id: workspaceId, motion: "Motion", status: "active" }
          : table === "workspace_members"
            ? member ? { user_id: userId } : null
            : table === "workspace_documents"
              ? { document_epoch: 2, id: documentId, side: "pro", title: "R1" }
              : table === "workspace_sources"
                ? Array.from({ length: sources }, () => ({ content: "Evidence", id: sourceId, provenance: {}, title: "Source" }))
                : [],
        error: null,
      }));
    },
    rpc() {
      return Promise.resolve({
        data: {
          documents: [{ epoch: 2, id: documentId, side: "pro", text: "Durable accepted text", title: "R1" }],
          messages: [],
          sources: [],
          workspace: { motion: "Motion" },
        },
        error: null,
      });
    },
  };
}

function input() {
  return {
    documentId,
    documentIds: [documentId],
    documentText: "FORGED CLIENT TEXT",
    documentTitle: "R1",
    motion: "Motion",
    requestId,
    side: "pro",
    sourceIds: [sourceId],
    threadRequest: null,
    threadId: null,
    workspaceId,
  };
}

Deno.test("workspace AI context uses server durable text after authorizing every ID", async () => {
  const loaded = await loadAuthorizedWorkspaceContext(database() as never, userId, input());
  assert(loaded.context.includes("Durable accepted text"));
  assert(!loaded.context.includes("FORGED CLIENT TEXT"));
  assertEquals(loaded.meta.includedSources, 1);
});

Deno.test("workspace AI context rejects a foreign requested source", async () => {
  await assertRejects(() => loadAuthorizedWorkspaceContext(database({ sources: 0 }) as never, userId, input()), Error, "Workspace unavailable");
});

Deno.test("workspace access recheck denies a revoked requester", async () => {
  assertEquals(await isWorkspaceMember(database({ member: false }) as never, userId, workspaceId), false);
});
