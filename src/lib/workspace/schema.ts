import { getSchema } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";

export const WORKSPACE_CONTENT_FIELD = "content";

export function workspaceSchemaExtensions() {
  return [StarterKit.configure({ undoRedo: false }), TableKit];
}

const workspaceSchema = getSchema(workspaceSchemaExtensions());

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
