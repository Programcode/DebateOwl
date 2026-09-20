import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import type * as Y from "yjs";
import {
  WORKSPACE_CONTENT_FIELD,
  workspaceSchemaExtensions,
} from "./schema";

export function createWorkspaceEditor(document: Y.Doc): Editor {
  return new Editor({
    extensions: [
      ...workspaceSchemaExtensions(),
      Collaboration.configure({
        document,
        field: WORKSPACE_CONTENT_FIELD,
      }),
    ],
  });
}
