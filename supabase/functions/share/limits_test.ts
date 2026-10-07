import { assertEquals } from "jsr:@std/assert@1.0.19";
import { TEST_ANON_KEY, TEST_SUPABASE_URL, TEST_USER, VALID_TOKEN } from "../_shared/testing/bearer-auth.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: TEST_SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

const DAY_MS = 24 * 60 * 60 * 1000;

type Calls = { quota: Record<string, unknown>[]; inserts: Record<string, unknown>[] };

// Sends one signed-in share request against a fake Supabase backend and
// records the quota reservations and inserts it makes.
async function sendShare(body: string, { quotaAllowed = true } = {}) {
  const calls: Calls = { quota: [], inserts: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== TEST_SUPABASE_URL) throw new Error(`Unexpected request: ${url}`);
    if (url.pathname === "/auth/v1/user") return Response.json(TEST_USER);
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (url.pathname === "/rest/v1/rpc/consume_daily_quota") {
      calls.quota.push(payload);
      return Response.json([{ allowed: quotaAllowed, current_count: quotaAllowed ? 1 : 50 }]);
    }
    if (url.pathname === "/rest/v1/shared_items") {
      calls.inserts.push(payload);
      return Response.json({ share_code: "abc123", expires_at: payload.expires_at }, { status: 201 });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/share", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${VALID_TOKEN}` },
      body,
    }));
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const shareBody = (fields: Record<string, unknown>) =>
  JSON.stringify({ itemType: "case", itemData: { motion: "This house would test" }, ...fields });

function assertExpiresInDays(expiresAt: unknown, days: number, before: number) {
  const at = Date.parse(String(expiresAt));
  if (!(at >= before + days * DAY_MS - 1000 && at <= Date.now() + days * DAY_MS + 1000)) {
    throw new Error(`expected an expiry ${days} days out, got ${expiresAt}`);
  }
}

Deno.test("share rejects a payload over the size cap before touching the database", async () => {
  const result = await sendShare(shareBody({ itemData: { body: "x".repeat(600 * 1024) } }));
  assertEquals(result, {
    status: 413,
    body: { error: "Shared content is too large.", code: "payload_too_large" },
    calls: { quota: [], inserts: [] },
  });
});

Deno.test("share rejects expiries that are not 1 to 90 whole days", async () => {
  for (const expiresInDays of [91, 0, -1, 1.5, "30", 1e9, null]) {
    const result = await sendShare(shareBody({ expiresInDays }));
    assertEquals(result, {
      status: 400,
      body: { error: "expiresInDays must be a whole number from 1 to 90." },
      calls: { quota: [], inserts: [] },
    }, `expiresInDays=${expiresInDays}`);
  }
});

Deno.test("share honours an expiry at the 90-day limit", async () => {
  const before = Date.now();
  const result = await sendShare(shareBody({ expiresInDays: 90 }));
  assertEquals(result.status, 200);
  assertEquals(result.calls.inserts.length, 1);
  assertExpiresInDays(result.calls.inserts[0].expires_at, 90, before);
});

Deno.test("share expires a link without an expiry after 30 days and reserves the share quota", async () => {
  const before = Date.now();
  const result = await sendShare(shareBody({}));
  assertEquals(result.status, 200);
  assertEquals(result.calls.quota, [{ p_user_id: TEST_USER.id, p_limit: 50, p_quota_key: "share" }]);
  assertEquals(result.calls.inserts.length, 1);
  assertExpiresInDays(result.calls.inserts[0].expires_at, 30, before);
  assertExpiresInDays(result.body.expiresAt, 30, before);
});

Deno.test("share refuses once the daily share quota is spent", async () => {
  const result = await sendShare(shareBody({}), { quotaAllowed: false });
  assertEquals(result.status, 429);
  assertEquals(result.body, {
    error: "You've reached the daily share limit (50). Try again tomorrow.",
    code: "limit_reached",
    limit: 50,
    current: 50,
  });
  assertEquals(result.calls.quota.length, 1);
  assertEquals(result.calls.inserts, []);
});

Deno.test("share answers malformed JSON with 400", async () => {
  const result = await sendShare("{not json");
  assertEquals(result, { status: 400, body: { error: "Invalid JSON body." }, calls: { quota: [], inserts: [] } });
});
