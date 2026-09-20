import { afterEach, describe, expect, it } from "vitest";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { createWorkspaceEditor } from "@/lib/workspace/editor-schema";
import * as review from "@/lib/workspace/review";
import {
  STRUCTURED_SPEECH,
  STRUCTURED_SPEECH_TEXT,
} from "./fixtures/structured-speech";

describe("workspace review model", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    cleanup.splice(0).forEach((dispose) => dispose());
  });

  function createEditor(document = new Y.Doc()) {
    const editor = createWorkspaceEditor(document);
    cleanup.push(() => editor.destroy());
    if (arguments.length === 0) cleanup.push(() => document.destroy());
    return editor;
  }

  it("keeps the representative multilingual document structured", () => {
    const editor = createEditor();

    expect(editor.commands.setContent(STRUCTURED_SPEECH)).toBe(true);

    expect(editor.getJSON()).toEqual(STRUCTURED_SPEECH);
    expect(editor.getJSON()).toMatchObject({
      content: expect.arrayContaining([
        expect.objectContaining({ type: "heading" }),
        expect.objectContaining({ type: "bulletList" }),
        expect.objectContaining({ type: "table" }),
      ]),
    });
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"citation"');
    for (const text of STRUCTURED_SPEECH_TEXT) {
      expect(editor.getText()).toContain(text);
    }
  });

  it("keeps suggested insert, delete, and formatting outside accepted content", async () => {
    const editor = createEditor();
    editor.commands.setContent("<p>Hello world</p>");
    const acceptedBefore = editor.getJSON();
    const composed = " tűrő".normalize("NFC");

    const proposal = review.createProposal({
      id: "proposal-1",
      authorId: "member-1",
      documentEpoch: 1,
      editor,
      hunks: [
        { id: "insert", kind: "insert", at: 6, content: [{ type: "text", text: composed }] },
        { id: "delete", kind: "delete", from: 7, to: 12 },
        {
          id: "format",
          kind: "format",
          from: 1,
          to: 6,
          content: [
            { type: "text", text: "Hello", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });

    expect(editor.getJSON()).toEqual(acceptedBefore);
    expect(proposal.hunks.map((hunk) => [hunk.kind, hunk.status])).toEqual([
      ["insert", "pending"],
      ["delete", "pending"],
      ["format", "pending"],
    ]);
    expect(proposal.hunks[0].replacement).toEqual([
      { type: "text", text: composed },
    ]);
    expect(proposal.hunks[2].replacement).toEqual([
      { type: "text", text: "Hello", marks: [{ type: "bold" }] },
    ]);
    expect(proposal.hunks[1].original).toEqual([
      { type: "text", text: "world" },
    ]);
  });

  it("accepts one independent hunk and keeps teammate text outside local undo", async () => {
    expect(review.acceptProposalHunks).toBeTypeOf("function");
    expect(review.rejectProposalHunks).toBeTypeOf("function");

    const leftDocument = new Y.Doc();
    const rightDocument = new Y.Doc();
    const fromLeft = Symbol("from-left");
    const fromRight = Symbol("from-right");
    const syncLeft = (update: Uint8Array, origin: unknown) => {
      if (origin !== fromRight) Y.applyUpdate(rightDocument, update, fromLeft);
    };
    const syncRight = (update: Uint8Array, origin: unknown) => {
      if (origin !== fromLeft) Y.applyUpdate(leftDocument, update, fromRight);
    };
    leftDocument.on("update", syncLeft);
    rightDocument.on("update", syncRight);
    cleanup.push(
      () => leftDocument.off("update", syncLeft),
      () => rightDocument.off("update", syncRight),
      () => leftDocument.destroy(),
      () => rightDocument.destroy(),
    );
    const left = createEditor(leftDocument);
    const right = createEditor(rightDocument);
    left.commands.setContent("<p>Alpha Beta Gamma</p>");
    expect(right.getJSON()).toEqual(left.getJSON());

    const proposal = review.createProposal({
      id: "proposal-2",
      authorId: "member-1",
      documentEpoch: 1,
      editor: left,
      hunks: [
        {
          id: "format-beta",
          kind: "format",
          from: 7,
          to: 11,
          content: [
            { type: "text", text: "Beta", marks: [{ type: "bold" }] },
          ],
        },
        { id: "delete-gamma", kind: "delete", from: 12, to: 17 },
      ],
    });

    yUndoPluginKey.getState(left.state).undoManager.clear();
    yUndoPluginKey.getState(right.state).undoManager.clear();
    right.commands.insertContentAt(1, "Remote ");
    left.commands.insertContentAt(left.state.doc.content.size - 1, " Local");

    const accepted = review.acceptProposalHunks({
      editor: left,
      documentEpoch: 1,
      proposal,
      hunkIds: ["format-beta"],
    });
    const reviewed = review.rejectProposalHunks({
      proposal: accepted,
      hunkIds: ["delete-gamma"],
    });

    expect(reviewed.hunks.map((hunk) => [hunk.id, hunk.status])).toEqual([
      ["format-beta", "accepted"],
      ["delete-gamma", "rejected"],
    ]);
    expect(left.getText()).toBe("Remote Alpha Beta Gamma Local");
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(left.getJSON()).toEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: "Beta",
                marks: [{ type: "bold" }],
              }),
            ]),
          }),
        ]),
      }),
    );

    expect(left.commands.undo()).toBe(true);
    expect(left.getText()).toBe("Remote Alpha Beta Gamma");
    expect(JSON.stringify(left.getJSON())).toContain('"type":"bold"');
    expect(left.commands.redo()).toBe(true);
    expect(left.getText()).toBe("Remote Alpha Beta Gamma Local");
    expect(JSON.stringify(left.getJSON())).toContain('"type":"bold"');
  });

  it("marks changed and overlapping exact targets stale without fuzzy replacement", async () => {
    const changed = createEditor();
    changed.commands.setContent("<p>alpha beta alpha</p>");
    const changedProposal = review.createProposal({
      id: "proposal-3",
      authorId: "member-1",
      documentEpoch: 1,
      editor: changed,
      hunks: [
        {
          id: "changed-target",
          kind: "format",
          from: 7,
          to: 11,
          content: [
            { type: "text", text: "beta", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });
    changed.commands.insertContentAt({ from: 7, to: 11 }, "alpha");

    let changedError: unknown;
    try {
      review.acceptProposalHunks({
        editor: changed,
        documentEpoch: 1,
        proposal: changedProposal,
        hunkIds: ["changed-target"],
      });
    } catch (error) {
      changedError = error;
    }
    expect(changedError).toBeInstanceOf(review.StaleProposalError);
    if (!(changedError instanceof review.StaleProposalError)) throw changedError;
    expect(changedError.proposal.hunks[0].status).toBe("stale");
    expect(changed.getText()).toBe("alpha alpha alpha");
    expect(JSON.stringify(changed.getJSON())).not.toContain('"type":"bold"');

    const overlapping = createEditor();
    overlapping.commands.setContent("<p>abcdefghij</p>");
    const overlappingProposal = review.createProposal({
      id: "proposal-4",
      authorId: "member-1",
      documentEpoch: 1,
      editor: overlapping,
      hunks: [
        {
          id: "left-range",
          kind: "format",
          from: 2,
          to: 6,
          content: [{ type: "text", text: "bcde", marks: [{ type: "bold" }] }],
        },
        { id: "right-range", kind: "delete", from: 4, to: 8 },
      ],
    });

    let overlapError: unknown;
    try {
      review.acceptProposalHunks({
        editor: overlapping,
        documentEpoch: 1,
        proposal: overlappingProposal,
        hunkIds: ["left-range", "right-range"],
      });
    } catch (error) {
      overlapError = error;
    }
    expect(overlapError).toBeInstanceOf(review.StaleProposalError);
    if (!(overlapError instanceof review.StaleProposalError)) throw overlapError;
    expect(overlapError.proposal.hunks.map((hunk) => hunk.status)).toEqual([
      "stale",
      "stale",
    ]);
    expect(overlapping.getText()).toBe("abcdefghij");
  });

  it("keeps quote anchors through unrelated insertion and detaches on target deletion", async () => {
    expect(review.createQuoteAnchor).toBeTypeOf("function");
    expect(review.resolveQuoteAnchor).toBeTypeOf("function");

    const editor = createEditor();
    editor.commands.setContent("<p>Claim target context</p>");
    const anchor = review.createQuoteAnchor({
      id: "comment-1",
      documentEpoch: 1,
      editor,
      from: 7,
      to: 13,
      quote: "target",
    });

    editor.commands.insertContentAt(1, "Unrelated ");
    const moved = review.resolveQuoteAnchor({
      anchor,
      documentEpoch: 1,
      editor,
    });
    expect(moved).toMatchObject({ status: "attached", quote: "target" });
    if (moved.status !== "attached") return;
    expect(editor.state.doc.textBetween(moved.from, moved.to)).toBe("target");

    editor.commands.deleteRange({ from: moved.from, to: moved.to });
    expect(review.resolveQuoteAnchor({
      anchor,
      documentEpoch: 1,
      editor,
    })).toEqual({ status: "detached", quote: "target" });
  });
});
