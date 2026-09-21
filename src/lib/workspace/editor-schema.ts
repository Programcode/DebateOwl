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
        let compositionFrom = 0;
        let compositionTo = 0;
        let compositionText = "";
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
            if (composing || transaction.getMeta("composition") !== undefined) return false;
            queueMicrotask(() => options.onSuggestion?.(hunk));
            return false;
          },
          props: {
            handleDOMEvents: {
              compositionend: (_view, rawEvent) => {
                composing = false;
                const text = (compositionText || (rawEvent as CompositionEvent).data).normalize("NFC");
                const hunk: ProposalHunkInput | undefined = text
                  ? compositionFrom === compositionTo
                    ? { at: compositionFrom, content: [{ type: "text", text }], id: crypto.randomUUID(), kind: "insert" }
                    : { content: [{ type: "text", text }], from: compositionFrom, id: crypto.randomUUID(), kind: "format", to: compositionTo }
                  : compositionFrom === compositionTo
                    ? undefined
                    : { from: compositionFrom, id: crypto.randomUUID(), kind: "delete", to: compositionTo };
                compositionText = "";
                if (hunk) queueMicrotask(() => options.onSuggestion?.(hunk));
                return false;
              },
              compositionstart: (view) => {
                composing = true;
                compositionFrom = view.state.selection.from;
                compositionTo = view.state.selection.to;
                compositionText = "";
                return false;
              },
              beforeinput: (_view, rawEvent) => {
                const event = rawEvent as InputEvent;
                if (!options.isSuggesting?.() || !composing || event.inputType !== "insertCompositionText") return false;
                compositionText = event.data ?? compositionText;
                event.preventDefault();
                return true;
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
