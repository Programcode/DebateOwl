import { HttpError, requireUser } from "../_shared/auth.ts";

const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:18080",
  "http://127.0.0.1:18080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type InviteSender = (
  message: { to: string; inviteUrl: string; idempotencyKey: string },
) => Promise<void>;

type Dependencies = {
  sender: InviteSender;
  baseUrl?: string;
};

function corsHeaders(origin: string | null) {
  const configured = (Deno.env.get("WORKSPACE_INVITE_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => {
      try {
        return new URL(value).origin === value;
      } catch {
        return false;
      }
    });
  const allowed = [...ALLOWED_ORIGINS, ...configured];
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value.trim();
}

function requiredUuid(value: unknown, name: string) {
  const text = requiredString(value, name);
  if (!UUID.test(text)) throw new HttpError(400, `Invalid ${name}`);
  return text;
}

function normalizeEmail(value: unknown) {
  const email = requiredString(value, "email").toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Invalid email");
  }
  return email;
}

function normalizeCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (!compact.startsWith("WS") || compact.length !== 22) {
    throw new HttpError(400, "Invalid invitation");
  }
  return `WS-${compact.slice(2).match(/.{4}/g)!.join("-")}`;
}

function secretKey() {
  const value = Deno.env.get("WORKSPACE_INVITE_SECRET");
  if (!value || value.length < 32) {
    throw new Error("Workspace invitations are not configured");
  }
  return value;
}

async function hmac(label: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${label}:${value}`),
    ),
  );
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replace(/=+$/, "");
}

function base32(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

async function inviteSecret(
  kind: "code" | "email",
  actorId: string,
  requestId: string,
) {
  const material = await hmac("invite", `${kind}:${actorId}:${requestId}`);
  if (kind === "email") return `wi_${base64Url(material.slice(0, 24))}`;
  const code = base32(material).slice(0, 20).match(/.{4}/g)!.join("-");
  return `WS-${code}`;
}

async function digest(value: string) {
  return `\\x${hex(await hmac("digest", value))}`;
}

async function keyedHash(label: "email" | "ip", value: string) {
  return `\\x${hex(await hmac(label, value))}`;
}

async function encryptEmail(email: string) {
  const keyBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`workspace-invite-email:${secretKey()}`),
  );
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(email),
    ),
  );
  return `v1.${base64Url(iv)}.${base64Url(ciphertext)}`;
}

function trustedProxyIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const values = forwarded.split(",").map((value) => value.trim()).filter(
      Boolean,
    );
    if (values.length) return values[values.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRecord(data: unknown) {
  const value = Array.isArray(data) ? data[0] : data;
  return isRecord(value) ? value : null;
}

function mapRpcError(error: { message?: string } | null) {
  const message = error?.message || "";
  if (message.includes("operation ID conflict")) {
    throw new HttpError(409, "Request ID conflict");
  }
  if (message.includes("workspace unavailable")) {
    throw new HttpError(404, "Workspace unavailable");
  }
  if (message.includes("invite rate limited")) {
    throw new HttpError(429, "Too many invitations. Try again later.");
  }
  if (message.includes("invite capacity exceeded")) {
    throw new HttpError(409, "Workspace member limit reached");
  }
  if (message.includes("invalid invite request")) {
    throw new HttpError(400, "Invalid invitation request");
  }
  throw new Error("Invitation database operation failed");
}

function configuredSender(): { sender: InviteSender; baseUrl: string } {
  const endpoint = Deno.env.get("WORKSPACE_INVITE_MAILER_URL");
  const token = Deno.env.get("WORKSPACE_INVITE_MAILER_TOKEN");
  const baseUrl = Deno.env.get("WORKSPACE_INVITE_BASE_URL");
  const format = Deno.env.get("WORKSPACE_INVITE_MAILER_FORMAT");
  if (!endpoint || !token || !baseUrl) {
    throw new HttpError(503, "Invitation email is unavailable");
  }

  return {
    baseUrl,
    sender: async (message) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: format === "mailpit"
          ? { "Content-Type": "application/json" }
          : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(format === "mailpit" ? {
          From: { Email: "workspace@debatelab.local", Name: "DebateLab" },
          To: [{ Email: message.to }],
          Subject: "Join your DebateLab workspace",
          Text: `Join your workspace: ${message.inviteUrl}`,
          Headers: { "X-Idempotency-Key": message.idempotencyKey },
        } : message),
      });
      if (!response.ok) throw new Error("Invitation email delivery failed");
    },
  };
}

export async function handleRequest(req: Request, dependencies?: Dependencies) {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  try {
    const auth = await requireUser(
      req,
      Deno.env.get("WORKSPACE_INVITE_SERVICE_ROLE_KEY") || undefined,
    );
    const parsedBody: unknown = await req.json().catch(() => null);
    if (!isRecord(parsedBody) || typeof parsedBody.action !== "string") {
      throw new HttpError(400, "Invalid invitation request");
    }
    const body = parsedBody;

    const action = body.action;
    const requestId = requiredUuid(body.requestId, "request ID");

    if (action === "create_code" || action === "rotate_code") {
      const workspaceId = requiredUuid(body.workspaceId, "workspace ID");
      const rotateInviteId = action === "rotate_code"
        ? requiredUuid(body.inviteId, "invite ID")
        : null;
      const maxUses = body.maxUses === undefined ? null : Number(body.maxUses);
      if (
        maxUses !== null &&
        (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 30)
      ) {
        throw new HttpError(400, "Invalid max uses");
      }
      const code = await inviteSecret("code", auth.user.id, requestId);
      const { data, error } = await auth.adminClient.rpc(
        "create_workspace_invite",
        {
          p_actor_id: auth.user.id,
          p_workspace_id: workspaceId,
          p_kind: "code",
          p_secret_digest: await digest(code),
          p_target_email_ciphertext: null,
          p_target_email_hash: null,
          p_max_uses: maxUses,
          p_request_id: requestId,
          p_rotate_invite_id: rotateInviteId,
        },
      );
      if (error) mapRpcError(error);
      const result = firstRecord(data);
      if (!result || result.revoked === true) {
        throw new HttpError(409, "Invitation is no longer available");
      }
      return json(
        {
          inviteId: result.invite_id,
          code,
          expiresAt: result.expires_at,
          maxUses: result.max_uses,
        },
        201,
        cors,
      );
    }

    if (action === "revoke") {
      const { data, error } = await auth.adminClient.rpc(
        "revoke_workspace_invite",
        {
          p_actor_id: auth.user.id,
          p_workspace_id: requiredUuid(body.workspaceId, "workspace ID"),
          p_invite_id: requiredUuid(body.inviteId, "invite ID"),
          p_request_id: requestId,
        },
      );
      if (error) mapRpcError(error);
      const result = firstRecord(data);
      if (!result?.revoked) {
        throw new Error("Invitation revoke returned no result");
      }
      return json({ revoked: true }, 200, cors);
    }

    if (action === "create_email") {
      const delivery = dependencies ?? configuredSender();
      const workspaceId = requiredUuid(body.workspaceId, "workspace ID");
      const email = normalizeEmail(body.email);
      const token = await inviteSecret("email", auth.user.id, requestId);
      const { data, error } = await auth.adminClient.rpc(
        "create_workspace_invite",
        {
          p_actor_id: auth.user.id,
          p_workspace_id: workspaceId,
          p_kind: "email",
          p_secret_digest: await digest(token),
          p_target_email_ciphertext: await encryptEmail(email),
          p_target_email_hash: await keyedHash("email", email),
          p_max_uses: 1,
          p_request_id: requestId,
          p_rotate_invite_id: null,
        },
      );
      if (error) mapRpcError(error);
      const result = firstRecord(data);
      if (!result || result.revoked === true) {
        throw new HttpError(503, "Invitation email is unavailable");
      }

      if (result.email_delivered !== true) {
        const expiresAt = typeof result.expires_at === "string"
          ? Date.parse(result.expires_at)
          : NaN;
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new HttpError(503, "Invitation email is unavailable");
        }
        const baseUrl = (delivery.baseUrl || "https://debate.pi-stack.org")
          .replace(/\/$/, "");
        try {
          await delivery.sender({
            to: email,
            inviteUrl: `${baseUrl}/app/workspaces/invite?token=${
              encodeURIComponent(token)
            }`,
            idempotencyKey: `workspace-invite:${result.invite_id}`,
          });
        } catch (error) {
          const message = error instanceof Error
            ? error.message.replace(/WS-[A-Z2-7-]+|wi_[A-Za-z0-9_-]+/g, "[redacted]")
            : "unknown delivery error";
          console.error(`[workspace-invites] delivery failed: ${message}`);
          throw new HttpError(503, "Invitation email is unavailable");
        }

        const { data: delivered, error: deliveryError } = await auth.adminClient
          .rpc("mark_workspace_invite_email_delivered", {
            p_actor_id: auth.user.id,
            p_invite_id: result.invite_id,
          });
        if (deliveryError || delivered !== true) {
          throw new Error("Invitation delivery state update failed");
        }
      }
      return json({ accepted: true }, 202, cors);
    }

    if (action === "redeem") {
      const supplied = requiredString(body.code ?? body.token, "invitation");
      const secret = body.code !== undefined
        ? normalizeCode(supplied)
        : supplied;
      if (body.code === undefined && !/^wi_[A-Za-z0-9_-]{32}$/.test(secret)) {
        throw new HttpError(400, "Invalid invitation");
      }
      const emailHash = auth.user.email && auth.user.email_confirmed_at
        ? await keyedHash("email", auth.user.email.trim().toLowerCase())
        : null;
      const ip = trustedProxyIp(req);
      const { data, error } = await auth.adminClient.rpc(
        "redeem_workspace_invite",
        {
          p_actor_id: auth.user.id,
          p_secret_digest: await digest(secret),
          p_actor_email_hash: emailHash,
          p_ip_hash: ip ? await keyedHash("ip", ip) : null,
          p_request_id: requestId,
        },
      );
      if (error) mapRpcError(error);
      const result = firstRecord(data);
      if (!result) throw new Error("Invitation redemption returned no result");
      if (result.status === "rate_limited") {
        return json(
          { error: "Too many attempts. Try again later." },
          429,
          cors,
        );
      }
      if (result.status !== "accepted") {
        return json({ error: "Invitation unavailable" }, 403, cors);
      }
      return json(
        {
          workspaceId: result.workspace_id,
          member: true,
          alreadyMember: result.already_member,
        },
        200,
        cors,
      );
    }

    throw new HttpError(400, "Invalid invitation action");
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status, cors);
    }
    const diagnostic = error instanceof Error
      ? error.message.replace(/WS-[A-Z2-7-]+|wi_[A-Za-z0-9_-]+/g, "[redacted]")
      : "unknown error";
    console.error(`[workspace-invites] ${diagnostic}`);
    return json(
      { error: "Invitations are temporarily unavailable" },
      500,
      cors,
    );
  }
}

if (import.meta.main) Deno.serve((req) => handleRequest(req));
