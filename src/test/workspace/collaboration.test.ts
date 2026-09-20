import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createWorkspaceEditor } from "@/lib/workspace/editor-schema";

function connectDocuments(left: Y.Doc, right: Y.Doc) {
  const leftOrigin = Symbol("left");
  const rightOrigin = Symbol("right");
  const leftUpdates: Uint8Array[] = [];
  const rightUpdates: Uint8Array[] = [];

  left.on("update", (update, origin) => {
    if (origin !== rightOrigin) leftUpdates.push(update);
  });
  right.on("update", (update, origin) => {
    if (origin !== leftOrigin) rightUpdates.push(update);
  });

  return () => {
    if (leftUpdates.length) {
      Y.applyUpdate(right, Y.mergeUpdates(leftUpdates.splice(0)), leftOrigin);
    }
    if (rightUpdates.length) {
      Y.applyUpdate(left, Y.mergeUpdates(rightUpdates.splice(0)), rightOrigin);
    }
  };
}

describe("workspace editor collaboration", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    cleanup.splice(0).forEach((dispose) => dispose());
  });

  it("converges structured paragraph, list, and link edits after reconnect", () => {
    const leftDocument = new Y.Doc();
    const rightDocument = new Y.Doc();
    const left = createWorkspaceEditor(leftDocument);
    const right = createWorkspaceEditor(rightDocument);
    const exchange = connectDocuments(leftDocument, rightDocument);
    cleanup.push(
      () => left.destroy(),
      () => right.destroy(),
      () => leftDocument.destroy(),
      () => rightDocument.destroy(),
    );

    left.commands.setContent("<p>Opening claim</p>");
    exchange();

    left.commands.insertContentAt(1, "For ");
    right.commands.insertContentAt(1, "Against ");
    exchange();

    left.commands.selectAll();
    expect(left.commands.toggleBulletList()).toBe(true);
    exchange();

    right.commands.selectAll();
    expect(right.commands.setLink({ href: "https://example.com/evidence" })).toBe(
      true,
    );
    exchange();

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.getJSON().content?.[0]?.type).toBe("bulletList");
    expect(JSON.stringify(left.getJSON())).toContain(
      "https://example.com/evidence",
    );
  });

  it("undoes only the current editor's last change", () => {
    const leftDocument = new Y.Doc();
    const rightDocument = new Y.Doc();
    const left = createWorkspaceEditor(leftDocument);
    const right = createWorkspaceEditor(rightDocument);
    const exchange = connectDocuments(leftDocument, rightDocument);
    cleanup.push(
      () => left.destroy(),
      () => right.destroy(),
      () => leftDocument.destroy(),
      () => rightDocument.destroy(),
    );

    left.commands.setContent("<p>Base</p>");
    exchange();
    left.commands.insertContentAt(5, " Alice");
    exchange();
    right.commands.insertContentAt(11, " Bob");
    exchange();

    expect(left.commands.undo()).toBe(true);
    exchange();

    expect(left.getText()).toContain("Bob");
    expect(left.getText()).not.toContain("Alice");
    expect(left.getJSON()).toEqual(right.getJSON());
  });
});
