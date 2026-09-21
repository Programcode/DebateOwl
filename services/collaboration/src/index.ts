import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { z } from "zod";
import { createWorkspaceAuthenticator } from "./auth";
import { PostgresDurableUpdateStore } from "./postgres-store";
import { parseRuntimeConfig } from "./runtime-config";
import { createCollaborationServer } from "./server";

const config = parseRuntimeConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });
const store = new PostgresDurableUpdateStore(pool);
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const verifyToken = async (token: string) => {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Workspace unavailable");
  const metadata = data.user.user_metadata;
  const name = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : undefined;
  return { email: data.user.email, id: data.user.id, name };
};
const authenticate = createWorkspaceAuthenticator({
  isAuthorized: (context) => store.isAuthorized(context),
  verifyToken,
});
const server = createCollaborationServer({
  allowedOrigins: new Set(config.allowedOrigins),
  authenticate,
  authorize: (context, operation) => store.isAuthorized(context, operation === "write"),
  changeAccess: async ({ expectedRevision, targetUserId, token, workspaceId }) => {
    await verifyToken(token);
    const authenticated = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await authenticated.rpc("change_workspace_access", {
      p_action: "remove",
      p_expected_revision: expectedRevision,
      p_request_id: crypto.randomUUID(),
      p_target_user_id: targetUserId,
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return z.coerce.number().int().nonnegative().parse(data);
  },
  decideProposal: async ({ decision, documentId, epoch, hunkId, proposalId, token }) => {
    const user = await verifyToken(token);
    return store.decideProposal({
      authorId: user.id,
      decision,
      documentId,
      epoch,
      hunkId,
      proposalId,
    });
  },
  store,
});

const accessListener = await pool.connect();
await accessListener.query("LISTEN workspace_access_revoked; LISTEN workspace_document_restored");
accessListener.on("notification", (message) => {
  if (message.channel !== "workspace_access_revoked" && message.channel !== "workspace_document_restored") return;
  // ponytail: global fence is safe for one trial process; target by workspace if disconnect churn matters.
  server.hocuspocus.closeConnections();
});

await server.listen(config.port);
console.info(`Collaboration service listening on 127.0.0.1:${config.port}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  accessListener.release();
  await server.destroy();
  await pool.end();
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
