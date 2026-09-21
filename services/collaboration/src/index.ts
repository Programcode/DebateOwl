import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
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
const authenticate = createWorkspaceAuthenticator({
  isAuthorized: (context) => store.isAuthorized(context),
  verifyToken: async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new Error("Workspace unavailable");
    const metadata = data.user.user_metadata;
    const name = typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : undefined;
    return { email: data.user.email, id: data.user.id, name };
  },
});
const server = createCollaborationServer({
  allowedOrigins: new Set(config.allowedOrigins),
  authenticate,
  authorize: (context, operation) => store.isAuthorized(context, operation === "write"),
  store,
});

const accessListener = await pool.connect();
await accessListener.query("LISTEN workspace_access_revoked");
accessListener.on("notification", (message) => {
  if (message.channel !== "workspace_access_revoked") return;
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
