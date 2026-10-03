for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");
const { getDemoLoginRole, hashDemoCode, isCreatableDemoRole } = await import("../_shared/demo-code.ts");

async function createDemoCode(body: Record<string, unknown>) {
  const inserts: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "admin-1", aud: "authenticated" });
    if (url.pathname === "/rest/v1/user_roles") return Response.json({ role: "admin" });
    if (url.pathname === "/rest/v1/demo_access_codes" && request.method === "POST") {
      const row = await request.json() as Record<string, unknown>;
      inserts.push(row);
      return Response.json({ id: "code-1", label: row.label, email: row.email, role: row.role }, { status: 201 });
    }
    throw new Error(`Unexpected request: ${request.method} ${url}`);
  }) as typeof fetch;
  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/admin?action=create-demo-code", {
      method: "POST",
      headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    return { inserts, response, payload: await response.json() as { code?: string; error?: string } };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("create-demo-code returns the raw code once, stores only its hash, and refuses other roles", async () => {
  const { inserts, response, payload } = await createDemoCode({ label: "Tournament room" });
  if (response.status !== 201) throw new Error(`create returned ${response.status}: ${JSON.stringify(payload)}`);
  const code = payload.code ?? "";
  if (!/^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new Error(`create did not return a usable code: ${code}`);
  if (inserts.length !== 1) throw new Error(`expected one insert, got ${inserts.length}`);
  const [row] = inserts;
  if (row.code_hash !== await hashDemoCode(code)) throw new Error("the stored hash does not match the returned code");
  if (row.role !== "user") throw new Error(`demo code stored role ${String(row.role)}`);
  const stored = JSON.stringify(row).toLowerCase();
  const secret = code.slice(5).replace("-", "").toLowerCase();
  if (stored.includes(code.toLowerCase()) || stored.includes(secret)) {
    throw new Error("the raw code, or the assigned email, reveals the code in the stored row");
  }

  const refused = await createDemoCode({ label: "Tournament room", role: "admin" });
  if (refused.response.status !== 400 || refused.inserts.length !== 0) {
    throw new Error(`admin-role demo code returned ${refused.response.status} with ${refused.inserts.length} inserts`);
  }
});

Deno.test("create-demo-code only accepts the user role", () => {
  if (!isCreatableDemoRole("user") || isCreatableDemoRole("admin") || isCreatableDemoRole("banned")) {
    throw new Error("demo codes must create ordinary users");
  }
});

Deno.test("demo-code login downgrades legacy admin rows", () => {
  if (getDemoLoginRole("admin") !== "user") {
    throw new Error("legacy admin-valued demo codes must grant user access");
  }
});
