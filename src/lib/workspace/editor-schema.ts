import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import {
  WORKSPACE_CONTENT_FIELD,
  workspaceSchemaExtensions,
} from "./schema";

export function createWorkspaceEditor(
  document: Y.Doc,
  options: {
    editable?: boolean;
    provider?: HocuspocusProvider;
    user?: { color: string; name: string };
  } = {},
): Editor {
  const collaborationCaret = options.provider && options.user
    ? [CollaborationCaret.configure({ provider: options.provider, user: options.user })]
    : [];
  return new Editor({
    editable: options.editable ?? true,
    editorProps: {
      attributes: {
        "aria-label": "Document editor",
        class: "min-h-64 px-4 py-3 focus:outline-none",
        role: "textbox",
      },
    },
    extensions: [
      ...workspaceSchemaExtensions(),
      Collaboration.configure({
        document,
        field: WORKSPACE_CONTENT_FIELD,
      }),
      ...collaborationCaret,
    ],
  });
}
