import { afterEach, describe, expect, it, vi } from "vitest";
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

  function createSyncedEditors() {
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
    return {
      left: createEditor(leftDocument),
      leftDocument,
      right: createEditor(rightDocument),
      rightDocument,
    };
  }

  it("restores binary proposal anchors after a JSON round trip", () => {
    const editor = createEditor();
    editor.commands.setContent("<p>Accepted text</p>");
    const proposal = review.createProposal({
      authorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      documentEpoch: 1,
      editor,
      hunks: [{
        content: [{ type: "paragraph", content: [{ type: "text", text: "Improved text" }] }],
        from: 0,
        id: "format",
        kind: "format",
        to: editor.state.doc.content.size,
      }],
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const restored = review.deserializeProposal(JSON.parse(JSON.stringify(review.serializeProposal(proposal))));

    expect(restored.baseStateVector).toBeInstanceOf(Uint8Array);
    expect(restored.hunks[0].from).toBeInstanceOf(Uint8Array);
    expect(restored.hunks[0].to).toBeInstanceOf(Uint8Array);
  });

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

  it("intercepts paste and emits only settled native composition without changing accepted text", async () => {
    const document = new Y.Doc();
    const onSuggestion = vi.fn();
    let suggesting = false;
    const editor = createWorkspaceEditor(document, {
      isSuggesting: () => suggesting,
      onSuggestion,
    });
    cleanup.push(() => editor.destroy(), () => document.destroy());
    editor.commands.setContent("<p>Alpha</p>");
    const accepted = editor.getJSON();
    suggesting = true;

    editor.view.dispatch(editor.state.tr.insertText(" pasted", 6).setMeta("uiEvent", "paste"));
    await vi.waitFor(() => expect(onSuggestion).toHaveBeenCalledTimes(1));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dom.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: " t", inputType: "insertCompositionText" }));
    editor.view.dom.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: " tűrő", inputType: "insertCompositionText" }));
    expect(onSuggestion).toHaveBeenCalledTimes(1);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));

    await vi.waitFor(() => expect(onSuggestion).toHaveBeenCalledTimes(2));
    expect(editor.getJSON()).toEqual(accepted);
    expect(onSuggestion.mock.calls.map(([hunk]) => hunk.kind)).toEqual(["insert", "insert"]);
    expect(onSuggestion.mock.calls[1][0].content).toEqual([{ type: "text", text: " tűrő" }]);

    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend", { data: " vég" }));
    await vi.waitFor(() => expect(onSuggestion).toHaveBeenCalledTimes(3));
    expect(onSuggestion.mock.calls[2][0].content).toEqual([{ type: "text", text: " vég" }]);

    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionupdate", { data: " ősz" }));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    await vi.waitFor(() => expect(onSuggestion).toHaveBeenCalledTimes(4));
    expect(onSuggestion.mock.calls[3][0].content).toEqual([{ type: "text", text: " ősz" }]);

    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionupdate", { data: " cancelled" }));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionupdate", { data: "" }));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSuggestion).toHaveBeenCalledTimes(4);

    suggesting = false;
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionupdate", { data: " committed" }));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend", { data: " committed" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSuggestion).toHaveBeenCalledTimes(4);
  });

  it("accepts one independent hunk and keeps teammate text outside local undo", async () => {
    expect(review.acceptProposalHunks).toBeTypeOf("function");
    expect(review.rejectProposalHunks).toBeTypeOf("function");

    const { left, right } = createSyncedEditors();
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
    proposal.hunks[0].original = [{ text: "Beta", type: "text" }];

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

  it("accepts independent hunks sequentially after the first shifts the document", () => {
    const document = new Y.Doc();
    const editor = createEditor(document);
    editor.commands.setContent("<p>Alpha Beta</p>");
    let proposal = review.createProposal({
      id: "proposal-sequential",
      authorId: "member-1",
      documentEpoch: 1,
      editor,
      hunks: [
        { id: "prefix", kind: "insert", at: 1, content: [{ type: "text", text: "Remote " }] },
        { id: "beta", kind: "format", from: 7, to: 11, content: [{ type: "text", text: "Beta", marks: [{ type: "bold" }] }] },
      ],
    });

    proposal = review.acceptProposalHunkInDocument({ document, documentEpoch: 1, hunkId: "prefix", proposal });
    proposal = review.acceptProposalHunkInDocument({ document, documentEpoch: 1, hunkId: "beta", proposal });

    expect(proposal.hunks.map(({ status }) => status)).toEqual(["accepted", "accepted"]);
    expect(editor.getText()).toBe("Remote Alpha Beta");
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');
  });

  it("stales a remotely deleted and reinserted identical target", () => {
    const { left, right, rightDocument } = createSyncedEditors();
    left.commands.setContent("<p>Alpha Beta Gamma</p>");
    const proposal = review.createProposal({
      id: "proposal-identity",
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
      ],
    });

    right.commands.insertContentAt(1, "Remote ");
    const paragraph = rightDocument.getXmlFragment("content").get(0);
    if (!(paragraph instanceof Y.XmlElement)) throw new Error("Expected paragraph element");
    const text = paragraph.get(0);
    if (!(text instanceof Y.XmlText)) throw new Error("Expected paragraph text");
    rightDocument.transact(() => {
      text.delete(13, 4);
      text.insert(13, "Beta");
    });
    const beforeAcceptance = left.getJSON();

    let stale: unknown;
    try {
      review.acceptProposalHunks({
        editor: left,
        documentEpoch: 1,
        proposal,
        hunkIds: ["format-beta"],
      });
    } catch (error) {
      stale = error;
    }

    expect(stale).toBeInstanceOf(review.StaleProposalError);
    if (!(stale instanceof review.StaleProposalError)) throw stale;
    expect(stale.proposal.hunks[0].status).toBe("stale");
    expect(left.getJSON()).toEqual(beforeAcceptance);
    expect(right.getJSON()).toEqual(beforeAcceptance);
    expect(left.getText()).toBe("Remote Alpha Beta Gamma");
    expect(JSON.stringify(left.getJSON())).not.toContain('"type":"bold"');
  });

  it("stales a remotely overlapped target and preserves unrelated remote text", () => {
    const { left, right } = createSyncedEditors();
    left.commands.setContent("<p>Alpha Beta Gamma</p>");
    const proposal = review.createProposal({
      id: "proposal-overlap",
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
      ],
    });

    right.commands.insertContentAt(1, "Remote ");
    right.commands.insertContentAt(16, "X");
    const beforeAcceptance = left.getJSON();

    let stale: unknown;
    try {
      review.acceptProposalHunks({
        editor: left,
        documentEpoch: 1,
        proposal,
        hunkIds: ["format-beta"],
      });
    } catch (error) {
      stale = error;
    }

    expect(stale).toBeInstanceOf(review.StaleProposalError);
    if (!(stale instanceof review.StaleProposalError)) throw stale;
    expect(stale.proposal.hunks[0].status).toBe("stale");
    expect(left.getJSON()).toEqual(beforeAcceptance);
    expect(right.getJSON()).toEqual(beforeAcceptance);
    expect(left.getText()).toBe("Remote Alpha BeXta Gamma");
    expect(JSON.stringify(left.getJSON())).not.toContain('"type":"bold"');
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
