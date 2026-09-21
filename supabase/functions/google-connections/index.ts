import { createAdminClient, HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import {
  decryptGoogleSecret,
  encryptGoogleSecret,
  getGoogleAccessToken,
  randomUrlToken,
  sha256,
} from "../_shared/google-connections.ts";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const ORIGINS = ["https://debate.pi-stack.org", "http://localhost:8080", "http://localhost:18080", "capacitor://localhost"];

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(value: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function uuid(value: unknown) {
  const text = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new HttpError(400, "Invalid connection");
  return text;
}

function oauthConfig() {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
  const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI") ?? "";
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google connections are not configured");
  return { clientId, clientSecret, redirectUri };
}

async function callback(req: Request) {
  const config = oauthConfig();
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code") ?? "";
  const state = requestUrl.searchParams.get("state") ?? "";
  const database = createAdminClient();
  const { data: stored, error } = await database.from("google_connection_states")
    .select("expires_at,nonce,return_to,user_id,used_at,verifier_ciphertext")
    .eq("state_hash", await sha256(state)).maybeSingle();
  if (error || !stored || stored.used_at || new Date(stored.expires_at).getTime() < Date.now() || !code) throw new HttpError(400, "Google connection expired");
  const { data: claimed } = await database.from("google_connection_states")
    .update({ used_at: new Date().toISOString() }).eq("state_hash", await sha256(state)).is("used_at", null).select("state_hash").maybeSingle();
  if (!claimed) throw new HttpError(400, "Google connection was already used");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: await decryptGoogleSecret(stored.verifier_ciphertext),
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const tokens = await tokenResponse.json() as { access_token?: string; expires_in?: number; id_token?: string; refresh_token?: string; scope?: string };
  if (!tokenResponse.ok || !tokens.access_token || !tokens.id_token) throw new HttpError(400, "Google authorization failed");
  const identityResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
  const identity = await identityResponse.json() as { aud?: string; email?: string; name?: string; nonce?: string; sub?: string };
  if (!identityResponse.ok || identity.aud !== config.clientId || identity.nonce !== stored.nonce || !identity.email || !identity.sub) throw new HttpError(400, "Google identity validation failed");
  const existing = await database.from("google_connections").select("id,refresh_token_ciphertext")
    .eq("user_id", stored.user_id).eq("email", identity.email).maybeSingle();
  const refreshCipher = tokens.refresh_token
    ? await encryptGoogleSecret(tokens.refresh_token)
    : existing.data?.refresh_token_ciphertext;
  if (!refreshCipher) throw new HttpError(400, "Google did not grant offline access");
  const connection = {
    access_expires_at: new Date(Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000).toISOString(),
    access_token_ciphertext: await encryptGoogleSecret(tokens.access_token),
    account_label: identity.name || identity.email,
    email: identity.email,
    refresh_token_ciphertext: refreshCipher,
    scopes: (tokens.scope ?? DRIVE_SCOPE).split(/\s+/).filter(Boolean),
    status: "active",
    updated_at: new Date().toISOString(),
    user_id: stored.user_id,
  };
  const saved = existing.data?.id
    ? await database.from("google_connections").update(connection).eq("id", existing.data.id).select("id").single()
    : await database.from("google_connections").insert(connection).select("id").single();
  if (saved.error) throw new Error("Google connection could not be saved");
  const appOrigin = Deno.env.get("APP_ORIGIN") ?? ORIGINS[0];
  return Response.redirect(new URL(`${stored.return_to}${stored.return_to.includes("?") ? "&" : "?"}google=connected`, appOrigin), 302);
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    if (req.method === "GET") return await callback(req);
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const auth = await requireUser(req);
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "authorize") {
      const returnTo = typeof body.returnTo === "string" && /^\/app(?:\/|$)/.test(body.returnTo) ? body.returnTo : "/app/library";
      const config = oauthConfig();
      const state = randomUrlToken();
      const verifier = randomUrlToken(48);
      const nonce = randomUrlToken();
      const challengeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      const challenge = btoa(String.fromCharCode(...challengeBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const { error } = await auth.adminClient.from("google_connection_states").insert({
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        nonce,
        return_to: returnTo,
        state_hash: await sha256(state),
        user_id: auth.user.id,
        verifier_ciphertext: await encryptGoogleSecret(verifier),
      });
      if (error) throw new Error("Google authorization could not start");
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        access_type: "offline",
        client_id: config.clientId,
        code_challenge: challenge,
        code_challenge_method: "S256",
        include_granted_scopes: "true",
        nonce,
        prompt: "consent select_account",
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: `openid email profile ${DRIVE_SCOPE}`,
        state,
      }).toString();
      return json({ url: url.toString() }, 200, headers);
    }
    const connectionId = uuid(body.connectionId);
    if (body.action === "picker-token") {
      const accessToken = await getGoogleAccessToken(auth.adminClient as never, auth.user.id, connectionId);
      return json({ accessToken }, 200, headers);
    }
    if (body.action === "disconnect") {
      const { data: connection } = await auth.adminClient.from("google_connections")
        .select("refresh_token_ciphertext").eq("id", connectionId).eq("user_id", auth.user.id).maybeSingle();
      if (!connection) throw new HttpError(404, "Google connection unavailable");
      const token = await decryptGoogleSecret(connection.refresh_token_ciphertext);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
      await auth.adminClient.from("google_connections").delete().eq("id", connectionId).eq("user_id", auth.user.id);
      return json({ disconnected: true }, 200, headers);
    }
    throw new HttpError(400, "Invalid action");
  } catch (error) {
    return jsonError(error, headers);
  }
});
