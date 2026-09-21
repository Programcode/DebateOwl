import { createHash } from "node:crypto";
import { z } from "zod";
import * as Y from "yjs";
import {
  acceptProposalHunkInDocument,
  deserializeProposal,
  rejectProposalHunks,
  serializeProposal,
} from "../../../src/lib/workspace/review";
import { validateWorkspaceDocument } from "../../../src/lib/workspace/schema";
import type { DurableAppend, DurableUpdate, DurableUpdateStore } from "./server";

export interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(destroy?: boolean): void;
  once(event: "error", listener: (error: Error) => void): this;
  removeListener(event: "error", listener: (error: Error) => void): this;
}

export interface PgPool {
  connect(): Promise<PgClient>;
}

type Writer = {
  client: PgClient;
  lost: boolean;
  refs: number;
  onLost: Set<() => void>;
};

const bigintSchema = z.union([z.number(), z.string()]).transform(Number);
const stateRowSchema = z.object({
  durable_sequence: bigintSchema,
  workspace_id: z.string().uuid(),
});
const durableRowSchema = z.object({
  author_id: z.string().uuid().nullable(),
  bytes: z.instanceof(Uint8Array),
  created_at: z.unknown().optional(),
  sequence: bigintSchema,
  sync_type: z.number(),
});
const storedUpdateRowSchema = durableRowSchema.extend({ mutation_id: z.string() });
const snapshotRowSchema = z.object({ snapshot: z.instanceof(Uint8Array) });
const authorizationRowSchema = z.object({ allowed: z.boolean() });
const proposalRowSchema = z.object({
  durable_sequence: bigintSchema,
  payload: z.unknown(),
  proposal_sequence: bigintSchema,
  snapshot: z.instanceof(Uint8Array),
  workspace_id: z.string().uuid(),
});

export class PostgresDurableUpdateStore implements DurableUpdateStore {
  private readonly writers = new Map<string, Writer>();

  constructor(private readonly pool: PgPool) {}

  async isAuthorized(
    context: { authorId: string; documentId: string; epoch: number },
    write = false,
  ) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM private.workspace_document_state AS state
           JOIN public.workspaces AS workspace ON workspace.id = state.workspace_id
           JOIN public.workspace_members AS member ON member.workspace_id = state.workspace_id
           WHERE state.document_id = $1
             AND state.epoch = $2
             AND member.user_id = $3
             AND workspace.status <> 'deleted'
             AND (NOT $4 OR workspace.status = 'active')
         ) AS allowed`,
        [context.documentId, context.epoch, context.authorId, write],
      );
      return authorizationRowSchema.parse(result.rows[0]).allowed;
    } finally {
      client.release();
    }
  }

  async loadSnapshot(documentId: string, epoch: number) {
    const result = await this.getWriter(documentId, epoch).query(
      `SELECT snapshot
       FROM private.workspace_document_state
       WHERE document_id = $1 AND epoch = $2`,
      [documentId, epoch],
    );
    const input = result.rows[0];
    return input ? new Uint8Array(snapshotRowSchema.parse(input).snapshot) : undefined;
  }

  async load(documentId: string, epoch: number): Promise<DurableUpdate[]> {
    const result = await this.getWriter(documentId, epoch).query(
      `SELECT author_id, bytes, mutation_id, sequence, sync_type
       FROM private.workspace_document_updates
       WHERE document_id = $1 AND epoch = $2
       ORDER BY sequence`,
      [documentId, epoch],
    );
    return storedUpdateRowSchema.array().parse(result.rows).map((row) => ({
      authorId: row.author_id ?? "",
      bytes: new Uint8Array(row.bytes),
      documentId,
      epoch,
      mutationId: row.mutation_id,
      sequence: row.sequence,
      syncType: row.sync_type,
    }));
  }

  async find(documentId: string, epoch: number, mutationId: string) {
    const result = await this.getWriter(documentId, epoch).query(
      `SELECT author_id, bytes, sequence, sync_type
       FROM private.workspace_document_updates
       WHERE document_id = $1 AND epoch = $2 AND mutation_id = $3`,
      [documentId, epoch, mutationId],
    );
    const input = result.rows[0];
    if (!input) return undefined;
    const row = durableRowSchema.parse(input);
    return {
      authorId: row.author_id ?? "",
      bytes: new Uint8Array(row.bytes),
      documentId,
      epoch,
      mutationId,
      sequence: row.sequence,
      syncType: row.sync_type,
    };
  }

  async append(update: DurableAppend): Promise<DurableUpdate> {
    const client = this.getWriter(update.documentId, update.epoch);

    await client.query("BEGIN");
    try {
      const stateResult = await client.query(
        `SELECT state.workspace_id, state.durable_sequence
         FROM private.workspace_document_state AS state
         JOIN public.workspaces AS workspace ON workspace.id = state.workspace_id
         JOIN public.workspace_members AS member
           ON member.workspace_id = state.workspace_id AND member.user_id = $3
         WHERE state.document_id = $1
           AND state.epoch = $2
           AND workspace.status = 'active'
         FOR UPDATE OF state`,
        [update.documentId, update.epoch, update.authorId],
      );
      const stateInput = stateResult.rows[0];
      if (!stateInput) throw new Error("Workspace access revoked");
      const state = stateRowSchema.parse(stateInput);

      const existingResult = await client.query(
        `SELECT author_id, bytes, sequence, sync_type
         FROM private.workspace_document_updates
         WHERE document_id = $1 AND epoch = $2 AND mutation_id = $3`,
        [update.documentId, update.epoch, update.mutationId],
      );
      const existingInput = existingResult.rows[0];
      if (existingInput) {
        const existing = durableRowSchema.parse(existingInput);
        await client.query("COMMIT");
        return {
          authorId: existing.author_id ?? "",
          bytes: new Uint8Array(existing.bytes),
          documentId: update.documentId,
          epoch: update.epoch,
          mutationId: update.mutationId,
          sequence: existing.sequence,
          syncType: existing.sync_type,
        };
      }

      const sequence = state.durable_sequence + 1;
      await client.query(
        `INSERT INTO private.workspace_document_updates (
           workspace_id, document_id, epoch, sequence, mutation_id, author_id, sync_type, bytes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          state.workspace_id,
          update.documentId,
          update.epoch,
          sequence,
          update.mutationId,
          update.authorId,
          update.syncType,
          Buffer.from(update.bytes),
        ],
      );
      await client.query(
        `UPDATE private.workspace_document_state
         SET durable_sequence = $2, snapshot = $3, updated_at = now()
         WHERE document_id = $1`,
        [update.documentId, sequence, Buffer.from(update.snapshot)],
      );
      await client.query(
        `UPDATE public.workspace_documents
         SET durable_sequence = $2, updated_at = now()
         WHERE id = $1`,
        [update.documentId, sequence],
      );
      await client.query("COMMIT");
      return { ...update, sequence };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  async snapshotVersion(documentId: string, epoch: number) {
    await this.getWriter(documentId, epoch).query(
      `WITH version AS (
         INSERT INTO public.workspace_versions (
           workspace_id, document_id, kind, document_epoch, durable_sequence
         )
         SELECT state.workspace_id, state.document_id, 'automatic', state.epoch,
           state.durable_sequence
         FROM private.workspace_document_state AS state
         WHERE state.document_id = $1
           AND state.epoch = $2
           AND state.durable_sequence > 0
           AND NOT EXISTS (
             SELECT 1 FROM public.workspace_versions AS existing
             WHERE existing.document_id = state.document_id
               AND existing.document_epoch = state.epoch
               AND existing.durable_sequence = state.durable_sequence
           )
         RETURNING id, document_id
       )
       INSERT INTO private.workspace_version_data (version_id, snapshot)
       SELECT version.id, state.snapshot
       FROM version
       JOIN private.workspace_document_state AS state
         ON state.document_id = version.document_id`,
      [documentId, epoch],
    );
  }

  async decideProposal(input: {
    authorId: string;
    decision: "accepted" | "rejected";
    documentId: string;
    epoch: number;
    hunkId: string;
    proposalId: string;
  }) {
    const key = `${input.documentId}@${input.epoch}`;
    const temporaryRelease = this.writers.has(key)
      ? undefined
      : await this.acquireWriter(input.documentId, input.epoch, () => undefined);
    const client = this.getWriter(input.documentId, input.epoch);
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `SELECT proposal.payload, proposal.durable_sequence AS proposal_sequence,
           state.durable_sequence, state.snapshot, state.workspace_id
         FROM public.workspace_proposals AS proposal
         JOIN private.workspace_document_state AS state
           ON state.workspace_id = proposal.workspace_id
          AND state.document_id = proposal.document_id
          AND state.epoch = proposal.document_epoch
         JOIN public.workspaces AS workspace ON workspace.id = proposal.workspace_id
         JOIN public.workspace_members AS member
           ON member.workspace_id = proposal.workspace_id AND member.user_id = $4
         WHERE proposal.id = $1 AND proposal.document_id = $2
           AND proposal.document_epoch = $3 AND workspace.status = 'active'
         FOR UPDATE OF proposal, state`,
        [input.proposalId, input.documentId, input.epoch, input.authorId],
      );
      if (!result.rows[0]) throw new Error("Workspace unavailable");
      const row = proposalRowSchema.parse(result.rows[0]);
      let proposal = deserializeProposal(row.payload);
      const hunk = proposal.hunks.find(({ id }) => id === input.hunkId);
      if (!hunk) throw new Error("Proposal unavailable");
      if (hunk.status !== "pending") {
        if (hunk.status !== input.decision) throw new Error("Proposal already decided");
        await client.query("COMMIT");
        return { proposal: serializeProposal(proposal), sequence: row.durable_sequence };
      }

      let update: Uint8Array | undefined;
      if (input.decision === "rejected") {
        proposal = rejectProposalHunks({ proposal, hunkIds: [input.hunkId] });
      } else {
        const document = new Y.Doc();
        try {
          if (row.snapshot.byteLength) Y.applyUpdate(document, row.snapshot);
          const before = Y.encodeStateVector(document);
          proposal = row.proposal_sequence === row.durable_sequence
            ? acceptProposalHunkInDocument({
              document,
              documentEpoch: input.epoch,
              hunkId: input.hunkId,
              proposal,
            })
            : {
              ...proposal,
              hunks: proposal.hunks.map((candidate) =>
                candidate.id === input.hunkId ? { ...candidate, status: "stale" as const } : candidate,
              ),
            };
          if (proposal.hunks.find(({ id }) => id === input.hunkId)?.status === "accepted") {
            update = Y.encodeStateAsUpdate(document, before);
            const snapshot = Y.encodeStateAsUpdate(document);
            validateWorkspaceDocument(document);
            if (!update.byteLength || update.byteLength > 2 * 1024 * 1024 || snapshot.byteLength > 2 * 1024 * 1024) {
              throw new Error("Collaboration document exceeds 2 MiB");
            }
            const sequence = row.durable_sequence + 1;
            const mutationId = createHash("sha256").update(update).digest("base64url");
            await client.query(
              `WITH version AS (
                 INSERT INTO public.workspace_versions (
                   workspace_id, document_id, created_by, kind, document_epoch, durable_sequence
                 ) VALUES ($1, $2, $3, 'automatic', $4, $5)
                 RETURNING id
               )
               INSERT INTO private.workspace_version_data (version_id, snapshot)
               SELECT id, $6 FROM version`,
              [row.workspace_id, input.documentId, input.authorId, input.epoch, row.durable_sequence, Buffer.from(row.snapshot)],
            );
            await client.query(
              `INSERT INTO private.workspace_document_updates (
                 workspace_id, document_id, epoch, sequence, mutation_id, author_id, sync_type, bytes
               ) VALUES ($1, $2, $3, $4, $5, $6, 2, $7)`,
              [row.workspace_id, input.documentId, input.epoch, sequence, mutationId, input.authorId, Buffer.from(update)],
            );
            await client.query(
              `UPDATE private.workspace_document_state
               SET durable_sequence = $2, snapshot = $3, updated_at = now()
               WHERE document_id = $1`,
              [input.documentId, sequence, Buffer.from(snapshot)],
            );
            await client.query(
              `UPDATE public.workspace_documents
               SET durable_sequence = $2, updated_at = now()
               WHERE id = $1`,
              [input.documentId, sequence],
            );
          }
        } finally {
          document.destroy();
        }
      }

      await client.query(
        `UPDATE public.workspace_proposals SET payload = $2, updated_at = now() WHERE id = $1`,
        [input.proposalId, JSON.stringify(serializeProposal(proposal))],
      );
      await client.query("COMMIT");
      return {
        proposal: serializeProposal(proposal),
        sequence: row.durable_sequence + (update ? 1 : 0),
        update,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await temporaryRelease?.();
    }
  }

  private getWriter(documentId: string, epoch: number) {
    const writer = this.writers.get(`${documentId}@${epoch}`);
    if (!writer || writer.lost) throw new Error("Collaboration writer unavailable");
    return writer.client;
  }

  async acquireWriter(documentId: string, epoch: number, onLost: () => void) {
    const key = `${documentId}@${epoch}`;
    const existing = this.writers.get(key);
    if (existing) {
      existing.refs += 1;
      existing.onLost.add(onLost);
      return this.releaseWriter(key, existing, onLost);
    }

    const client = await this.pool.connect();
    const writer: Writer = { client, lost: false, refs: 1, onLost: new Set([onLost]) };
    const handleLoss = () => {
      if (writer.lost) return;
      writer.lost = true;
      this.writers.delete(key);
      writer.onLost.forEach((notify) => notify());
      client.release(true);
    };
    client.once("error", handleLoss);

    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
        `workspace-document:${key}`,
      ]);
    } catch (error) {
      writer.lost = true;
      client.removeListener("error", handleLoss);
      client.release(true);
      throw error;
    }
    this.writers.set(key, writer);
    return this.releaseWriter(key, writer, onLost, handleLoss);
  }

  private releaseWriter(
    key: string,
    writer: Writer,
    onLost: () => void,
    handleLoss?: (error: Error) => void,
  ) {
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      writer.refs -= 1;
      writer.onLost.delete(onLost);
      if (writer.lost || writer.refs > 0) return;

      this.writers.delete(key);
      if (handleLoss) writer.client.removeListener("error", handleLoss);
      try {
        await writer.client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
          `workspace-document:${key}`,
        ]);
      } finally {
        writer.client.release();
      }
    };
  }
}
