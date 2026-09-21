import { describe, expect, it, vi } from "vitest";

const saveArtifact = vi.hoisted(() => vi.fn().mockResolvedValue("artifact"));
vi.mock("@/lib/workspace/practice-client", () => ({ saveWorkspaceArtifact: saveArtifact }));

import { attachWorkspaceResult, parseWorkspaceToolContext, type WorkspaceToolContext } from "@/lib/workspace/tool-context";

const context: WorkspaceToolContext = {
  documentEpoch: 3,
  documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  documentIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  documentText: "R1 text",
  documentTitle: "R1",
  motion: "Schools should ban phones",
  requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  returnUrl: "/app/workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  side: "pro" as const,
  sourceIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
  threadRequest: null,
  threadId: null,
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("workspace tool context", () => {
  it("preserves the pinned motion, side, document version, and origin", async () => {
    const parsed = parseWorkspaceToolContext(context);
    expect(parsed).toMatchObject({ documentEpoch: 3, motion: context.motion, side: "pro", workspaceId: context.workspaceId });

    await attachWorkspaceResult(parsed, "attack", { caseText: "R1 text" }, { score: 80 });

    expect(saveArtifact).toHaveBeenCalledOnce();
    expect(saveArtifact).toHaveBeenCalledWith(expect.objectContaining({
      documentEpoch: 3,
      documentId: context.documentId,
      requestId: context.requestId,
      tool: "attack",
      workspaceId: context.workspaceId,
    }));
  });

  it("rejects a foreign return route instead of attaching late output elsewhere", () => {
    expect(parseWorkspaceToolContext({ ...context, returnUrl: "/app/workspaces/not-a-uuid" })).toBeNull();
  });
});
