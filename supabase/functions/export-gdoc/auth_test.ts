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

Deno.test("export-gdoc reports a failed content update instead of an empty success", async () => {
  await runBearerCases(handleRequest, (authorization) => new Request("http://127.0.0.1/functions/v1/export-gdoc", {
    method: "POST",
    headers: { Authorization: authorization!, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "brainstorm", data: { topFive: [{ rank: 1, idea: { title: "Buses" } }] }, accessToken: "test-google-token" }),
  }), [{
    label: "batch update failed",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 502,
    body: {
      success: false,
      error: "The Google Doc was created, but its content could not be saved. Try the export again.",
      code: "DOCUMENT_UPDATE_FAILED",
      documentUrl: "https://docs.google.com/document/d/doc-1/edit",
      documentId: "doc-1",
    },
    authCalls: 1,
  }], (url) => {
    if (url.href === "https://docs.googleapis.com/v1/documents") {
      return Response.json({ documentId: "doc-1" });
    }
    if (url.href === "https://docs.googleapis.com/v1/documents/doc-1:batchUpdate") {
      return Response.json({ error: { message: "PRIVATE_GOOGLE_BODY" } }, { status: 500 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

Deno.test("export-gdoc returns the document when Google accepts the content", async () => {
  await runBearerCases(handleRequest, (authorization) => new Request("http://127.0.0.1/functions/v1/export-gdoc", {
    method: "POST",
    headers: { Authorization: authorization!, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "brainstorm", data: {}, accessToken: "test-google-token" }),
  }), [{
    label: "batch update succeeded",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 200,
    body: {
      success: true,
      documentUrl: "https://docs.google.com/document/d/doc-2/edit",
      documentId: "doc-2",
    },
    authCalls: 1,
  }], (url) => {
    if (url.href === "https://docs.googleapis.com/v1/documents") {
      return Response.json({ documentId: "doc-2" });
    }
    if (url.href === "https://docs.googleapis.com/v1/documents/doc-2:batchUpdate") {
      return Response.json({ documentId: "doc-2" });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

Deno.test("export-gdoc does not allow arbitrary LAN origins", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/export-gdoc", {
    method: "OPTIONS", headers: { Origin: "http://192.168.1.5:8080" },
  }));
  if (response.headers.get("Access-Control-Allow-Origin") !== "https://debateowl.com") throw new Error("LAN origin was reflected");
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
