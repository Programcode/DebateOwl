import { getSchema, Node } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";

export const WORKSPACE_CONTENT_FIELD = "content";

export const InlineCitation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      sourceId: { default: null },
      title: { default: null },
      locator: { default: null },
      quote: { default: null },
      href: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-citation-source-id]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      { "data-citation-source-id": node.attrs.sourceId },
      node.attrs.locator ? `[${node.attrs.locator}]` : "[citation]",
    ];
  },
  renderText({ node }) {
    return node.attrs.locator ? `[${node.attrs.locator}]` : "[citation]";
  },
});

export function workspaceSchemaExtensions() {
  return [StarterKit.configure({ undoRedo: false }), TableKit, InlineCitation];
}

export const workspaceSchema = getSchema(workspaceSchemaExtensions());

export function validateWorkspaceDocument(document: Y.Doc) {
  for (const name of document.share.keys()) {
    if (name !== WORKSPACE_CONTENT_FIELD) {
      throw new Error(`Unexpected shared type: ${name}`);
    }
  }

  const json = yXmlFragmentToProsemirrorJSON(
    document.getXmlFragment(WORKSPACE_CONTENT_FIELD),
  );
  workspaceSchema.nodeFromJSON(json).check();
}
