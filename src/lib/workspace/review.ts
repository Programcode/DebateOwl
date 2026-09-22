import type { Editor, JSONContent } from "@tiptap/core";
import { createMappablePosition } from "@tiptap/extension-collaboration";
import { Fragment, Slice } from "@tiptap/pm/model";
import {
  prosemirrorJSONToYXmlFragment,
  relativePositionToAbsolutePosition,
  yXmlFragmentToProsemirrorJSON,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { z } from "zod";
import { EditorState } from "@tiptap/pm/state";
import { WORKSPACE_CONTENT_FIELD, workspaceSchema } from "./schema";

export type ProposalHunkStatus = "pending" | "accepted" | "rejected" | "stale";

export type ProposalHunkInput =
  | { id: string; kind: "insert"; at: number; content: JSONContent[] }
  | { id: string; kind: "delete"; from: number; to: number }
  | {
      id: string;
      kind: "format";
      from: number;
      to: number;
      content: JSONContent[];
    };

export interface ProposalHunk {
  absoluteFrom: number;
  absoluteTo: number;
  id: string;
  kind: ProposalHunkInput["kind"];
  status: ProposalHunkStatus;
  from: Uint8Array;
  to: Uint8Array;
  original: JSONContent[];
  replacement: JSONContent[];
  contextBefore: JSONContent[];
  contextAfter: JSONContent[];
}

export interface WorkspaceProposal {
  id: string;
  authorId: string;
  documentEpoch: number;
  baseStateVector: Uint8Array;
  hunks: ProposalHunk[];
}

const bytesSchema = z.array(z.number().int().min(0).max(255)).transform((bytes) => Uint8Array.from(bytes));
const contentSchema = z.array(z.unknown()).nullable().transform((content) => content ?? []);
const serializedProposalSchema = z.object({
  authorId: z.string().uuid(),
  baseStateVector: bytesSchema,
  documentEpoch: z.number().int().nonnegative(),
  hunks: z.array(z.object({
    contextAfter: contentSchema,
    contextBefore: contentSchema,
    absoluteFrom: z.number().int().nonnegative(),
    absoluteTo: z.number().int().nonnegative(),
    from: bytesSchema,
    id: z.string().min(1).max(100),
    kind: z.enum(["insert", "delete", "format"]),
    original: contentSchema,
    replacement: z.array(z.unknown()),
    status: z.enum(["pending", "accepted", "rejected", "stale"]),
    to: bytesSchema,
  })).min(1).max(100),
  id: z.string().uuid(),
});

export type SerializedWorkspaceProposal = ReturnType<typeof serializeProposal>;

export function serializeProposal(proposal: WorkspaceProposal) {
  return {
    ...proposal,
    baseStateVector: Array.from(proposal.baseStateVector),
    hunks: proposal.hunks.map((hunk) => ({
      ...hunk,
      from: Array.from(hunk.from),
      to: Array.from(hunk.to),
    })),
  };
}

export function deserializeProposal(input: unknown): WorkspaceProposal {
  const proposal = serializedProposalSchema.parse(input);
  return {
    ...proposal,
    baseStateVector: new Uint8Array(proposal.baseStateVector),
    hunks: proposal.hunks.map((hunk) => ({
      ...hunk,
      contextAfter: hunk.contextAfter ?? [],
      contextBefore: hunk.contextBefore ?? [],
      from: new Uint8Array(hunk.from),
      original: hunk.original ?? [],
      to: new Uint8Array(hunk.to),
    })),
  };
}

export interface QuoteAnchor {
  id: string;
  documentEpoch: number;
  from: Uint8Array;
  to: Uint8Array;
  quote: string;
}

function normalizedContent(editor: Editor, content: JSONContent[]) {
  return Fragment.fromJSON(editor.schema, content).toJSON();
}

function rangeFor(input: ProposalHunkInput) {
  return input.kind === "insert"
    ? { from: input.at, to: input.at }
    : { from: input.from, to: input.to };
}

function documentFor(editor: Editor): Y.Doc {
  const state = ySyncPluginKey.getState(editor.state);
  if (!state?.doc) throw new Error("Workspace editor is not bound to Yjs");
  return state.doc;
}

function sameContent(left: JSONContent[], right: JSONContent[]) {
  const canonical = (value: unknown): unknown => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)).map(([key, item]) => [key, canonical(item)]))
      : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function resolveAnchors(editor: Editor, fromAnchor: Uint8Array, toAnchor: Uint8Array) {
  const state = ySyncPluginKey.getState(editor.state);
  if (!state?.doc || !state.type || !state.binding?.mapping) return null;

  const from = relativePositionToAbsolutePosition(
    state.doc,
    state.type,
    Y.decodeRelativePosition(fromAnchor),
    state.binding.mapping,
  );
  const to = relativePositionToAbsolutePosition(
    state.doc,
    state.type,
    Y.decodeRelativePosition(toAnchor),
    state.binding.mapping,
  );
  return from === null || to === null || from > to ? null : { from, to };
}

function resolvedRange(editor: Editor, hunk: ProposalHunk) {
  const range = resolveAnchors(editor, hunk.from, hunk.to);
  if (!range) return null;
  const { from, to } = range;

  const documentEnd = editor.state.doc.content.size;
  const original = editor.state.doc.slice(from, to).content.toJSON() ?? [];
  const contextBefore = editor.state.doc
    .slice(Math.max(0, from - 1), from)
    .content.toJSON() ?? [];
  const contextAfter = editor.state.doc
    .slice(to, Math.min(documentEnd, to + 1))
    .content.toJSON() ?? [];

  return sameContent(original, hunk.original) &&
    sameContent(contextBefore, hunk.contextBefore) &&
    sameContent(contextAfter, hunk.contextAfter)
    ? { from, to }
    : null;
}

function withStatuses(
  proposal: WorkspaceProposal,
  hunkIds: Set<string>,
  status: ProposalHunkStatus,
): WorkspaceProposal {
  return {
    ...proposal,
    hunks: proposal.hunks.map((hunk) =>
      hunkIds.has(hunk.id) ? { ...hunk, status } : hunk,
    ),
  };
}

export class StaleProposalError extends Error {
  constructor(
    public readonly hunkIds: string[],
    public readonly proposal: WorkspaceProposal,
  ) {
    super(`Stale proposal hunks: ${hunkIds.join(", ")}`);
    this.name = "StaleProposalError";
  }
}

export function createProposal({
  id,
  authorId,
  documentEpoch,
  editor,
  hunks,
}: {
  id: string;
  authorId: string;
  documentEpoch: number;
  editor: Editor;
  hunks: ProposalHunkInput[];
}): WorkspaceProposal {
  const document = documentFor(editor);
  const documentEnd = editor.state.doc.content.size;

  return {
    id,
    authorId,
    documentEpoch,
    baseStateVector: Y.encodeStateVector(document),
    hunks: hunks.map((input) => {
      const { from, to } = rangeFor(input);
      if (from < 0 || to < from || to > documentEnd) {
        throw new RangeError(`Invalid proposal range ${from}..${to}`);
      }

      const replacement =
        input.kind === "delete" ? [] : normalizedContent(editor, input.content);

      return {
        absoluteFrom: from,
        absoluteTo: to,
        id: input.id,
        kind: input.kind,
        status: "pending",
        from: Y.encodeRelativePosition(
          createMappablePosition(from, editor.state).yRelativePosition,
        ),
        to: Y.encodeRelativePosition(
          createMappablePosition(to, editor.state).yRelativePosition,
        ),
        original: editor.state.doc.slice(from, to).content.toJSON() ?? [],
        replacement,
        contextBefore: editor.state.doc
          .slice(Math.max(0, from - 1), from)
          .content.toJSON() ?? [],
        contextAfter: editor.state.doc
          .slice(to, Math.min(documentEnd, to + 1))
          .content.toJSON() ?? [],
      };
    }),
  };
}

export function acceptProposalHunkInDocument({
  document,
  documentEpoch,
  hunkId,
  proposal,
}: {
  document: Y.Doc;
  documentEpoch: number;
  hunkId: string;
  proposal: WorkspaceProposal;
}) {
  const hunk = proposal.hunks.find(({ id }) => id === hunkId);
  if (!hunk || hunk.status !== "pending") throw new Error("Proposal unavailable");
  const state = EditorState.create({
    doc: workspaceSchema.nodeFromJSON(
      yXmlFragmentToProsemirrorJSON(document.getXmlFragment(WORKSPACE_CONTENT_FIELD)),
    ),
    schema: workspaceSchema,
  });
  const { absoluteFrom: from, absoluteTo: to } = hunk;
  const documentEnd = state.doc.content.size;
  const original = state.doc.slice(from, to).content.toJSON() ?? [];
  const contextBefore = state.doc.slice(Math.max(0, from - 1), from).content.toJSON() ?? [];
  const contextAfter = state.doc.slice(to, Math.min(documentEnd, to + 1)).content.toJSON() ?? [];
  if (
    documentEpoch !== proposal.documentEpoch ||
    !sameContent(original, hunk.original) ||
    !sameContent(contextBefore, hunk.contextBefore) ||
    !sameContent(contextAfter, hunk.contextAfter)
  ) {
    return withStatuses(proposal, new Set([hunkId]), "stale");
  }
  const transaction = state.tr.replace(
    from,
    to,
    new Slice(Fragment.fromJSON(workspaceSchema, hunk.replacement), 0, 0),
  );
  prosemirrorJSONToYXmlFragment(
    workspaceSchema,
    transaction.doc.toJSON(),
    document.getXmlFragment(WORKSPACE_CONTENT_FIELD),
  );
  return {
    ...proposal,
    hunks: proposal.hunks.map((candidate) => candidate.id === hunkId
      ? { ...candidate, status: "accepted" as const }
      : candidate.status === "pending"
        ? {
            ...candidate,
            absoluteFrom: transaction.mapping.map(candidate.absoluteFrom, -1),
            absoluteTo: transaction.mapping.map(candidate.absoluteTo, 1),
          }
        : candidate),
  };
}

export function createProposalAfterComposition({
  compositionState,
  proposal,
}: {
  compositionState: "idle" | "composing" | "settled";
  proposal: Parameters<typeof createProposal>[0];
}): WorkspaceProposal | null {
  return compositionState === "settled" ? createProposal(proposal) : null;
}

export function acceptProposalHunks({
  editor,
  documentEpoch,
  proposal,
  hunkIds,
}: {
  editor: Editor;
  documentEpoch: number;
  proposal: WorkspaceProposal;
  hunkIds: string[];
}): WorkspaceProposal {
  const selectedIds = new Set(hunkIds);
  if (selectedIds.size !== hunkIds.length) {
    throw new Error("Duplicate proposal hunk ID");
  }

  const selected = proposal.hunks.filter((hunk) => selectedIds.has(hunk.id));
  if (selected.length !== selectedIds.size) throw new Error("Unknown proposal hunk ID");
  if (selected.some((hunk) => hunk.status !== "pending")) {
    throw new Error("Only pending proposal hunks can be accepted");
  }

  const resolved = selected.map((hunk) => ({ hunk, range: resolvedRange(editor, hunk) }));
  const stale = resolved
    .filter(({ range }) => range === null)
    .map(({ hunk }) => hunk.id);
  if (documentEpoch !== proposal.documentEpoch) stale.push(...selected.map((hunk) => hunk.id));

  const valid = resolved
    .filter((item): item is { hunk: ProposalHunk; range: { from: number; to: number } } =>
      item.range !== null,
    )
    .sort((left, right) => left.range.from - right.range.from);
  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1].range;
    const current = valid[index].range;
    if (current.from < previous.to ||
      (current.from === previous.from && current.to === previous.to)) {
      stale.push(valid[index - 1].hunk.id, valid[index].hunk.id);
    }
  }
  if (stale.length > 0) {
    const staleIds = [...new Set(stale)];
    throw new StaleProposalError(
      staleIds,
      withStatuses(proposal, new Set(staleIds), "stale"),
    );
  }

  const transaction = valid
    .sort((left, right) => right.range.from - left.range.from)
    .reduce(
      (next, { hunk, range }) =>
        next.replace(
          range.from,
          range.to,
          new Slice(Fragment.fromJSON(editor.schema, hunk.replacement), 0, 0),
        ),
      editor.state.tr,
    )
    .setMeta("addToHistory", false);
  editor.view.dispatch(transaction);

  return withStatuses(proposal, selectedIds, "accepted");
}

export function rejectProposalHunks({
  proposal,
  hunkIds,
}: {
  proposal: WorkspaceProposal;
  hunkIds: string[];
}): WorkspaceProposal {
  const selectedIds = new Set(hunkIds);
  if (selectedIds.size !== hunkIds.length) throw new Error("Duplicate proposal hunk ID");
  const selected = proposal.hunks.filter((hunk) => selectedIds.has(hunk.id));
  if (selected.length !== selectedIds.size) throw new Error("Unknown proposal hunk ID");
  if (selected.some((hunk) => hunk.status !== "pending")) {
    throw new Error("Only pending proposal hunks can be rejected");
  }
  return withStatuses(proposal, selectedIds, "rejected");
}

export function createQuoteAnchor({
  id,
  documentEpoch,
  editor,
  from,
  to,
  quote,
}: {
  id: string;
  documentEpoch: number;
  editor: Editor;
  from: number;
  to: number;
  quote: string;
}): QuoteAnchor {
  if (from < 0 || to <= from || to > editor.state.doc.content.size) {
    throw new RangeError(`Invalid quote range ${from}..${to}`);
  }
  if (editor.state.doc.textBetween(from, to) !== quote) {
    throw new Error("Quote does not match the anchored text");
  }
  return {
    id,
    documentEpoch,
    from: Y.encodeRelativePosition(
      createMappablePosition(from, editor.state).yRelativePosition,
    ),
    to: Y.encodeRelativePosition(
      createMappablePosition(to, editor.state).yRelativePosition,
    ),
    quote,
  };
}

export function resolveQuoteAnchor({
  anchor,
  documentEpoch,
  editor,
}: {
  anchor: QuoteAnchor;
  documentEpoch: number;
  editor: Editor;
}):
  | { status: "attached"; from: number; to: number; quote: string }
  | { status: "detached"; quote: string } {
  if (anchor.documentEpoch !== documentEpoch) {
    return { status: "detached", quote: anchor.quote };
  }
  const range = resolveAnchors(editor, anchor.from, anchor.to);
  if (!range || editor.state.doc.textBetween(range.from, range.to) !== anchor.quote) {
    return { status: "detached", quote: anchor.quote };
  }
  return { status: "attached", ...range, quote: anchor.quote };
}
