// Test support for Edge Functions that authenticate with requireUser.
// Deno only collects *_test.ts and *.test.ts files, so this module is not a
// test itself, and no deployed function imports it.
import { assertEquals } from "jsr:@std/assert@1.0.19";

export const TEST_SUPABASE_URL = "https://supabase.test";
export const TEST_ANON_KEY = "test-anon-key";
export const VALID_TOKEN = "valid-token";
export const TEST_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "user@example.test",
};

/**
 * Stripe's fetch client keeps the fetch it saw when the function module was
 * imported. Call this before that import so Stripe's calls reach whatever fetch
 * a test installs later (runBearerCases's `otherFetch`, for one).
 */
export function forwardFetchToCurrentStub(): void {
  const realFetch = globalThis.fetch;
  const forwardingFetch: typeof fetch = (input, init) =>
    globalThis.fetch === forwardingFetch ? realFetch(input, init) : globalThis.fetch(input, init);
  globalThis.fetch = forwardingFetch;
}

export type BearerCase = {
  label: string;
  authorization?: string;
  status: number;
  body: unknown;
  /** Calls to the Auth user endpoint this request may make. */
  authCalls: number;
};

/** Missing, empty, non-Bearer and rejected credentials, all refused with 401. */
export function rejectedBearerCases(bodies: { required: unknown; invalid: unknown }): BearerCase[] {
  return [
    { label: "missing header", status: 401, body: bodies.required, authCalls: 0 },
    { label: "empty bearer token", authorization: "Bearer   ", status: 401, body: bodies.required, authCalls: 0 },
    { label: "non-Bearer scheme", authorization: "Basic dXNlcjpwYXNz", status: 401, body: bodies.required, authCalls: 0 },
    { label: "rejected token", authorization: "Bearer expired-token", status: 401, body: bodies.invalid, authCalls: 1 },
  ];
}

type OtherFetch = (url: URL, headers: Headers, init?: RequestInit) => Response | Promise<Response>;

function headersOf(input: Request | URL | string, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

/**
 * Sends one request per case through `handle`. Supabase Auth accepts only
 * VALID_TOKEN; any other outbound request goes to `otherFetch`, or fails the
 * test when none is given.
 */
export async function runBearerCases(
  handle: (req: Request) => Promise<Response>,
  makeRequest: (authorization?: string) => Request,
  cases: BearerCase[],
  otherFetch?: OtherFetch,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const authCalls: string[] = [];

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = headersOf(input, init);
    if (url.origin === TEST_SUPABASE_URL && url.pathname === "/auth/v1/user") {
      const authorization = headers.get("authorization") ?? "";
      authCalls.push(authorization);
      return authorization === `Bearer ${VALID_TOKEN}`
        ? Response.json(TEST_USER)
        : Response.json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 401 });
    }
    if (otherFetch) return await otherFetch(url, headers, init);
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    for (const testCase of cases) {
      authCalls.length = 0;
      const response = await handle(makeRequest(testCase.authorization));
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Keep the raw text so the assertion shows it.
      }
      assertEquals(
        { status: response.status, body, authCalls: authCalls.length },
        { status: testCase.status, body: testCase.body, authCalls: testCase.authCalls },
        testCase.label,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}
