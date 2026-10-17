import {
  rejectedBearerCases,
  runBearerCases,
  TEST_ANON_KEY,
  TEST_SUPABASE_URL,
  VALID_TOKEN,
} from "../_shared/testing/bearer-auth.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: TEST_SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

const send = (authorization?: string) =>
  new Request("http://127.0.0.1/functions/v1/export-gdoc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({}),
  });

// The browser reads `error` and treats any 401 as "sign in again", so the
// function keeps its { error: "Unauthorized", details } shape.
Deno.test("export-gdoc refuses missing, empty, non-Bearer and rejected tokens in its own error shape", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({
    required: { error: "Unauthorized", details: "Authentication required" },
    invalid: { error: "Unauthorized", details: "Invalid authentication token" },
  }));
});

Deno.test("export-gdoc lets a valid token through to request validation", async () => {
  await runBearerCases(handleRequest, send, [{
    label: "valid token",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 400,
    body: { error: "Missing data" },
    authCalls: 1,
  }]);
});

Deno.test("export-gdoc does not allow arbitrary LAN origins", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/export-gdoc", {
    method: "OPTIONS", headers: { Origin: "http://192.168.1.5:8080" },
  }));
  if (response.headers.get("Access-Control-Allow-Origin") !== "https://debate.pi-stack.org") throw new Error("LAN origin was reflected");
});

Deno.test("export-gdoc conceals Google error bodies while retaining reauthentication codes and statuses", async () => {
  for (const [googleStatus, status, code, error] of [
    [401, 401, "AUTH_EXPIRED", "Google authentication expired. Re-authenticate with Google and try again."],
    [403, 403, "DRIVE_SCOPE_REQUIRED", "Google Drive permission is missing or insufficient. Connect Google Drive and try again."],
    [500, 502, "GOOGLE_DOC_CREATE_FAILED", "Failed to create Google Doc"],
  ] as const) {
    await runBearerCases(handleRequest, (authorization) => new Request("http://127.0.0.1/functions/v1/export-gdoc", {
      method: "POST", headers: { Authorization: authorization! },
      body: JSON.stringify({ mode: "brainstorm", data: {}, accessToken: "test-google-token" }),
    }), [{ label: `Google ${googleStatus}`, authorization: `Bearer ${VALID_TOKEN}`, status, body: { error, code, googleStatus, googleReason: "SERVICE_DISABLED" }, authCalls: 1 }], (url) => {
      if (url.href !== "https://docs.googleapis.com/v1/documents") throw new Error(`Unexpected request: ${url}`);
      return Response.json({ error: { message: "PRIVATE_GOOGLE_BODY", status: "SERVICE_DISABLED" } }, { status: googleStatus });
    });
  }
});
