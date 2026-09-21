import { Editor, Extension } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { Plugin } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import type { ProposalHunkInput } from "./review";
import {
  WORKSPACE_CONTENT_FIELD,
  workspaceSchemaExtensions,
} from "./schema";

export function createWorkspaceEditor(
  document: Y.Doc,
  options: {
    editable?: boolean;
    ariaLabel?: string;
    provider?: HocuspocusProvider;
    isSuggesting?: () => boolean;
    onSuggestion?: (hunk: ProposalHunkInput) => void;
    user?: { color: string; name: string };
  } = {},
): Editor {
  const collaborationCaret = options.provider && options.user
    ? [CollaborationCaret.configure({ provider: options.provider, user: options.user })]
    : [];
  const suggestionInterceptor = options.isSuggesting && options.onSuggestion
    ? [Extension.create({
      name: "workspaceSuggestionInterceptor",
      addProseMirrorPlugins() {
        let composing = false;
        let compositionHunk: ProposalHunkInput | undefined;
        let compositionTimer: ReturnType<typeof setTimeout> | undefined;
        const finishComposition = () => {
          if (compositionHunk) options.onSuggestion?.(compositionHunk);
          compositionHunk = undefined;
          compositionTimer = undefined;
        };
        return [new Plugin({
          filterTransaction: (transaction, state) => {
            if (!options.isSuggesting?.() || !transaction.docChanged || transaction.getMeta(ySyncPluginKey)) {
              return true;
            }
            const from = state.doc.content.findDiffStart(transaction.doc.content);
            const ends = state.doc.content.findDiffEnd(transaction.doc.content);
            if (from === null || !ends) return true;
            const to = ends.a;
            const replacementTo = ends.b;
            const kind = from === to ? "insert" : from === replacementTo ? "delete" : "format";
            const hunk: ProposalHunkInput = kind === "insert"
              ? { at: from, content: transaction.doc.slice(from, replacementTo).content.toJSON(), id: crypto.randomUUID(), kind }
              : kind === "delete"
                ? { from, id: crypto.randomUUID(), kind, to }
                : { content: transaction.doc.slice(from, replacementTo).content.toJSON(), from, id: crypto.randomUUID(), kind, to };
            if (composing || transaction.getMeta("composition") !== undefined || compositionTimer) {
              compositionHunk = hunk;
              return false;
            }
            queueMicrotask(() => options.onSuggestion?.(hunk));
            return false;
          },
          props: {
            handleDOMEvents: {
              compositionend: () => {
                composing = false;
                if (compositionTimer) clearTimeout(compositionTimer);
                compositionTimer = setTimeout(finishComposition, 0);
                return false;
              },
              compositionstart: () => {
                composing = true;
                compositionHunk = undefined;
                if (compositionTimer) clearTimeout(compositionTimer);
                compositionTimer = undefined;
                return false;
              },
            },
          },
        })];
      },
    })]
    : [];
  return new Editor({
    content: { type: "doc", content: [] },
    editable: options.editable ?? true,
    editorProps: {
      attributes: {
        "aria-label": options.ariaLabel ?? "Document editor",
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
      ...suggestionInterceptor,
    ],
  });
}
