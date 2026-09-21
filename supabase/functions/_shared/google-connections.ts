type QueryResult = { data: unknown; error: { message?: string } | null };
type ServiceDatabase = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<QueryResult>;
        single(): Promise<QueryResult>;
      };
    };
  };
  rpc(name: string, parameters: Record<string, unknown>): Promise<QueryResult>;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const raw = base64ToBytes(Deno.env.get("GOOGLE_CONNECTION_ENCRYPTION_KEY") ?? "");
  if (raw.byteLength !== 32) throw new Error("Google connection encryption is unavailable");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGoogleSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value)));
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv);
  combined.set(encrypted, iv.byteLength);
  return bytesToBase64(combined);
}

export async function decryptGoogleSecret(value: string) {
  const combined = base64ToBytes(value);
  if (combined.byteLength < 29) throw new Error("Invalid encrypted Google token");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, await encryptionKey(), combined.slice(12));
  return new TextDecoder().decode(decrypted);
}

export function randomUrlToken(bytes = 32) {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function row(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return row(value[0]);
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export async function getGoogleAccessToken(database: ServiceDatabase, userId: string, connectionId: string) {
  const claimId = crypto.randomUUID();
  const claim = await database.rpc("claim_google_connection_refresh", {
    p_claim_id: claimId,
    p_connection_id: connectionId,
    p_user_id: userId,
  });
  if (claim.error) throw new Error("Google connection unavailable");
  const claimed = row(claim.data);
  if (!claimed) throw new Error("Google connection unavailable");
  if (!claimed.claimed) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const current = await database.from("google_connections")
        .select("access_token_ciphertext,access_expires_at,refresh_claim_id,status,user_id")
        .eq("id", connectionId).maybeSingle();
      const currentRow = row(current.data);
      if (!current.error && currentRow?.user_id === userId && currentRow.status === "active" && !currentRow.refresh_claim_id && currentRow.access_token_ciphertext) {
        return decryptGoogleSecret(String(currentRow.access_token_ciphertext));
      }
    }
    throw new Error("Google connection is busy; try again");
  }

  const accessCipher = typeof claimed.access_token_ciphertext === "string" ? claimed.access_token_ciphertext : null;
  const accessExpiry = typeof claimed.access_expires_at === "string" ? new Date(claimed.access_expires_at).getTime() : 0;
  if (accessCipher && accessExpiry > Date.now() + 60_000) {
    await database.rpc("finish_google_connection_refresh", {
      p_access_expires_at: claimed.access_expires_at,
      p_access_token_ciphertext: accessCipher,
      p_claim_id: claimId,
      p_connection_id: connectionId,
      p_refresh_token_ciphertext: null,
    });
    return decryptGoogleSecret(accessCipher);
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
        client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "",
        grant_type: "refresh_token",
        refresh_token: await decryptGoogleSecret(String(claimed.refresh_token_ciphertext)),
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const payload = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
    if (!response.ok || !payload.access_token) throw new Error("Google token refresh failed");
    const nextAccessCipher = await encryptGoogleSecret(payload.access_token);
    const nextRefreshCipher = payload.refresh_token ? await encryptGoogleSecret(payload.refresh_token) : null;
    const expiresAt = new Date(Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000).toISOString();
    const finished = await database.rpc("finish_google_connection_refresh", {
      p_access_expires_at: expiresAt,
      p_access_token_ciphertext: nextAccessCipher,
      p_claim_id: claimId,
      p_connection_id: connectionId,
      p_refresh_token_ciphertext: nextRefreshCipher,
    });
    if (finished.error || finished.data !== true) throw new Error("Google token refresh lost its claim");
    return payload.access_token;
  } catch (error) {
    await database.rpc("finish_google_connection_refresh", {
      p_access_expires_at: claimed.access_expires_at ?? new Date(0).toISOString(),
      p_access_token_ciphertext: accessCipher ?? await encryptGoogleSecret("invalid"),
      p_claim_id: claimId,
      p_connection_id: connectionId,
      p_refresh_token_ciphertext: null,
    });
    throw error;
  }
}
