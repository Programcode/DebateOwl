import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Production canary. Everything here is read-only except the last test, which
// makes one small real AI request as the dedicated canary account.
const supabaseUrl = process.env.PROD_SUPABASE_URL ?? "https://uziwdtkzofptihahfooo.supabase.co";
const anonKey = process.env.PROD_SUPABASE_ANON_KEY;
const email = process.env.PROD_CANARY_EMAIL;
const password = process.env.PROD_CANARY_PASSWORD;
// workspace-invites joins this list when production enables Workspaces
// (VITE_COLLABORATION_URL); until then the routes are hidden and it is not deployed.
const functions = [
  "admin", "ai", "ai-stream", "announcements", "create-checkout", "create-portal", "demo-code-login",
  "export-gdoc", "import-source", "redeem-promo", "share",
];

if (process.env.CI && !(anonKey && email && password)) throw new Error("Production canary secrets are incomplete");

test("the production site loads and guards the app", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/DebateLab/);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.goto("/app/generate");
  await expect(page).toHaveURL(`${baseURL}/login`);
  expect(errors).toEqual([]);
});

test("every browser-facing Edge Function is deployed and passes the browser's preflight", async ({ request, baseURL }) => {
  // The same preflight Chromium sends before supabase-js POSTs with a session.
  const requestedHeaders = ["authorization", "apikey", "content-type", "x-client-info"];
  for (const name of functions) {
    const response = await request.fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: {
        Origin: baseURL!,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": requestedHeaders.join(", "),
      },
    });
    expect(response.status(), `${name} preflight`).toBeLessThan(300);
    const headers = response.headers();
    expect(headers["access-control-allow-origin"], `${name} allowed origin`).toBe(baseURL);
    expect(headers["access-control-allow-methods"], `${name} allowed methods`).toMatch(/\bPOST\b/);
    const allowed = (headers["access-control-allow-headers"] ?? "").toLowerCase().split(/\s*,\s*/);
    expect(allowed, `${name} allowed headers`).toEqual(expect.arrayContaining(requestedHeaders));
  }
});

test("the AI function rejects unauthenticated calls instead of crashing", async ({ request }) => {
  const response = await request.post(`${supabaseUrl}/functions/v1/ai`, { data: { feature: "ask", input: { message: "hi" } } });
  expect(response.status()).toBe(401);
});

test("the canary account gets a streamed answer from a real model", async ({ page }) => {
  test.skip(!(anonKey && email && password), "Canary credentials are not configured");
  const client = createClient(supabaseUrl, anonKey!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
  if (error || !data.session) throw error ?? new Error("Canary sign-in failed");
  await page.addInitScript((session) => {
    localStorage.setItem("debate-auth-production", JSON.stringify(session));
    localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 }));
  }, data.session);

  await page.goto("/app/ask");
  // GPT-5.6 Luna is the Basic default, so this is the path most users take.
  await page.getByRole("combobox", { name: "Select AI model for ask" }).click();
  await page.getByRole("option", { name: /GPT-5\.6 Luna/ }).first().click();
  await page.getByPlaceholder("Ask your debate coach...").fill("Reply with one short sentence: what is a rebuttal?");
  const stream = page.waitForResponse((response) => response.url().endsWith("/functions/v1/ai-stream"), { timeout: 90_000 });
  await page.getByRole("button", { name: "Send message" }).click();
  const response = await stream;
  expect(response.status()).toBe(200);
  // ai-stream emits SSE blocks of `event: delta` with `data: {"text": ...}`.
  const text = (await response.text()).split("\n\n")
    .filter((block) => block.includes("event: delta"))
    .map((block) => JSON.parse(block.split("\n").find((line) => line.startsWith("data:"))!.slice(5)).text as string)
    .join("");
  expect(text.trim().length, "streamed answer text").toBeGreaterThan(0);
});
