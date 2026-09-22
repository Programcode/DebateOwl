import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { decryptGoogleSecret, encryptGoogleSecret, getGoogleAccessToken } from "./google-connections.ts";

const CONNECTION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "a0000000-0000-4000-8000-000000000002";

Deno.test("Google connection secrets round-trip through AES-GCM", async () => {
  Deno.env.set("GOOGLE_CONNECTION_ENCRYPTION_KEY", btoa("12345678901234567890123456789012"));
  const encrypted = await encryptGoogleSecret("refresh-secret");
  assertEquals(await decryptGoogleSecret(encrypted), "refresh-secret");
});

Deno.test("valid cached access tokens release the refresh claim", async () => {
  Deno.env.set("GOOGLE_CONNECTION_ENCRYPTION_KEY", btoa("12345678901234567890123456789012"));
  const access = await encryptGoogleSecret("cached-access");
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const database = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ name, parameters });
      if (name === "claim_google_connection_refresh") return { data: [{ access_token_ciphertext: access, access_expires_at: new Date(Date.now() + 120_000).toISOString(), refresh_token_ciphertext: "unused", claimed: true }], error: null };
      return { data: true, error: null };
    },
  };
  assertEquals(await getGoogleAccessToken(database as never, USER_ID, CONNECTION_ID), "cached-access");
  assertEquals(calls.at(-1)?.name, "finish_google_connection_refresh");
});

Deno.test("refresh preserves an omitted replacement refresh token", async () => {
  Deno.env.set("GOOGLE_CONNECTION_ENCRYPTION_KEY", btoa("12345678901234567890123456789012"));
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
  const refresh = await encryptGoogleSecret("refresh-secret");
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const database = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ name, parameters });
      if (name === "claim_google_connection_refresh") return { data: [{ access_token_ciphertext: null, access_expires_at: null, refresh_token_ciphertext: refresh, claimed: true }], error: null };
      return { data: true, error: null };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ access_token: "fresh-access", expires_in: 3600 }), { status: 200 }));
  try {
    assertEquals(await getGoogleAccessToken(database as never, USER_ID, CONNECTION_ID), "fresh-access");
    assertEquals(calls.at(-1)?.parameters.p_refresh_token_ciphertext, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a slow refresh aborts before its database claim can expire", async () => {
  Deno.env.set("GOOGLE_CONNECTION_ENCRYPTION_KEY", btoa("12345678901234567890123456789012"));
  const refresh = await encryptGoogleSecret("refresh-secret");
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const database = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ name, parameters });
      if (name === "claim_google_connection_refresh") return { data: [{ access_token_ciphertext: null, access_expires_at: null, refresh_token_ciphertext: refresh, claimed: true }], error: null };
      return { data: true, error: null };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(signal?.reason ?? new Error("aborted"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    await assertRejects(() => getGoogleAccessToken(database as never, USER_ID, CONNECTION_ID, 1));
    assertEquals(calls.at(-1)?.name, "finish_google_connection_refresh");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a foreign or missing connection is rejected", async () => {
  const database = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  };
  await assertRejects(() => getGoogleAccessToken(database as never, USER_ID, CONNECTION_ID), Error, "Google connection unavailable");
});
