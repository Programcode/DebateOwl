import { useEffect, useMemo, useRef, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { EditorContent } from "@tiptap/react";
import { z } from "zod";
import * as Y from "yjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLLABORATION_URL } from "@/lib/workspace/collaboration-config";
import { deleteWorkspaceDraft, loadWorkspaceDraft, saveWorkspaceDraft } from "@/lib/workspace/draft-store";
import { durableMutationFromMessage } from "@/lib/workspace/durable-ack";
import { createWorkspaceEditor } from "@/lib/workspace/editor-schema";

const acknowledgementSchema = z.object({
  epoch: z.number().int().nonnegative(),
  kind: z.literal("durable-ack"),
  mutationId: z.string(),
  sequence: z.number().int().positive(),
});

type SaveStatus = "Offline" | "Saved" | "Saving";

export function WorkspaceEditor({
  documentId,
  editable,
  epoch,
  token,
  userId,
  userName,
  workspaceId,
}: {
  documentId: string;
  editable: boolean;
  epoch: number;
  token: string;
  userId: string;
  userName: string;
  workspaceId: string;
}) {
  const identity = useMemo(
    () => ({ documentId, epoch, userId, workspaceId }),
    [documentId, epoch, userId, workspaceId],
  );
  const [editor, setEditor] = useState<ReturnType<typeof createWorkspaceEditor> | null>(null);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<SaveStatus>(navigator.onLine ? "Saving" : "Offline");
  const [storageWarning, setStorageWarning] = useState(false);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;
    let provider: HocuspocusProvider | undefined;
    let activeEditor: ReturnType<typeof createWorkspaceEditor> | undefined;
    const document = new Y.Doc();
    const persist = async () => {
      try {
        await saveWorkspaceDraft({
          ...identity,
          pendingMutationIds: [...pending.current],
          snapshot: Y.encodeStateAsUpdate(document),
          updatedAt: Date.now(),
        });
        if (!disposed) setStorageWarning(false);
      } catch {
        if (!disposed) setStorageWarning(true);
      }
    };
    const start = async () => {
      try {
        const draft = await loadWorkspaceDraft(identity);
        if (draft?.snapshot.byteLength) Y.applyUpdate(document, draft.snapshot);
        draft?.pendingMutationIds.forEach((mutationId) => pending.current.add(mutationId));
      } catch {
        if (!disposed) setStorageWarning(true);
      }
      if (disposed || !COLLABORATION_URL) return;

      provider = new HocuspocusProvider({
        document,
        name: `${documentId}@${epoch}`,
        onOutgoingMessage: ({ message }) => {
          void durableMutationFromMessage(message.toUint8Array()).then((mutation) => {
            if (!mutation || disposed) return;
            pending.current.add(mutation.mutationId);
            setStatus("Saving");
            void persist();
          });
        },
        onStateless: ({ payload }) => {
          let input: unknown;
          try {
            input = JSON.parse(payload);
          } catch {
            return;
          }
          const acknowledgement = acknowledgementSchema.safeParse(input);
          if (!acknowledgement.success || acknowledgement.data.epoch !== epoch) return;
          pending.current.delete(acknowledgement.data.mutationId);
          setStatus(pending.current.size === 0 ? "Saved" : "Saving");
          if (pending.current.size === 0) void deleteWorkspaceDraft(identity);
          else void persist();
        },
        onStatus: ({ status: nextStatus }) => {
          if (nextStatus === "disconnected") setStatus("Offline");
        },
        onSynced: () => {
          if (pending.current.size > 0) {
            provider?.sendStateless(JSON.stringify({
              epoch,
              kind: "durable-ack-query",
              mutationIds: [...pending.current].slice(0, 100),
            }));
          } else {
            setStatus("Saved");
          }
        },
        token,
        url: COLLABORATION_URL,
      });
      activeEditor = createWorkspaceEditor(document, {
        editable,
        provider,
        user: { color: `hsl(${Math.abs(userId.charCodeAt(0) * 47) % 360} 70% 45%)`, name: userName },
      });
      document.on("update", () => void persist());
      if (!disposed) setEditor(activeEditor);
    };
    const offline = () => setStatus("Offline");
    const online = () => provider?.connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    void start();

    return () => {
      disposed = true;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      activeEditor?.destroy();
      provider?.destroy();
      document.destroy();
    };
  }, [documentId, editable, epoch, identity, token, userId, userName]);

  if (!COLLABORATION_URL) {
    return <p role="alert" className="p-4 text-sm text-destructive">Collaboration service is not configured.</p>;
  }
  if (!editor) return <p role="status" className="p-4 text-sm text-muted-foreground">Opening editor...</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2" role="toolbar" aria-label="Formatting">
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()}>Bold</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBulletList().run()}>Bullets</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleOrderedList().run()}>Numbered list</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().insertTable({ cols: 2, rows: 2, withHeaderRow: true }).run()}>Table</Button>
        <Input className="h-9 w-48" aria-label="Link URL" value={link} onChange={(event) => setLink(event.target.value)} />
        <Button type="button" size="sm" variant="outline" onClick={() => editor.chain().focus().setLink({ href: link }).run()}>Link</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.commands.undo()}>Undo</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.commands.redo()}>Redo</Button>
        <span className="ml-auto text-xs text-muted-foreground" role="status">{status}</span>
      </div>
      {storageWarning && <p role="alert" className="px-4 pt-3 text-sm text-destructive">Local recovery storage is unavailable.</p>}
      <EditorContent editor={editor} />
    </div>
  );
}
