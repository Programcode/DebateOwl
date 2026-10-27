import { createHash } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { createDemoUser, debateControl, deleteDemoUser, expect, test } from "./fixtures";

// Feature map: features/auth-demo-login.md. Demo-code sign-in, reload, rejection, and
// sign-out are covered by e2e/full-stack/auth.spec.ts, which drive also runs.

const mailer = process.env.WORKSPACE_TEST_MAILER_URL;
const supabaseUrl = process.env.LOCAL_SUPABASE_URL;

/** Reads the six-digit code sent to `email` after `sentAfter` from the local Mailpit inbox; `not` skips an older code. */
async function readOtp(request: APIRequestContext, email: string, sentAfter: number, not?: string) {
  let otp = "";
  await expect.poll(async () => {
    const payload = await (await request.get(`${mailer}/api/v1/messages`)).json() as { messages?: Array<Record<string, unknown>> };
    for (const message of payload.messages ?? []) {
      if (!JSON.stringify(message).includes(email)) continue;
      if (Date.parse(String(message.Created ?? 0)) < sentAfter - 5_000) continue;
      const detail = await (await request.get(`${mailer}/api/v1/message/${message.ID}`)).text();
      otp = detail.match(/\b(\d{6})\b/)?.[1] ?? "";
      if (otp === not) otp = "";
      if (otp) break;
    }
    return otp;
  }, { timeout: 30_000 }).toMatch(/^\d{6}$/);
  return otp;
}

/**
 * Ends the Resend countdown (AUTH-04) without waiting a minute. LoginPage reads
 * the stored deadline every second, so the button turns back within one tick.
 */
async function expireResendCooldown(page: Page) {
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("debatelab:otp-resend-until:")) sessionStorage.setItem(key, "0");
  });
  await expect(page.getByRole("button", { name: "Resend code" })).toBeEnabled({ timeout: 3_000 });
}

/** Every path this tab shows, kept across reloads, so a flash of /login is caught. */
async function recordPaths(page: Page) {
  await page.addInitScript(() => {
    const record = () => {
      const seen = JSON.parse(sessionStorage.getItem("verify-paths") ?? "[]") as string[];
      sessionStorage.setItem("verify-paths", JSON.stringify([...seen, location.pathname]));
    };
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<History["pushState"]>) => {
        original(...args);
        record();
      };
    }
    record();
  });
  return {
    clear: () => page.evaluate(() => sessionStorage.removeItem("verify-paths")),
    seen: () => page.evaluate(() => JSON.parse(sessionStorage.getItem("verify-paths") ?? "[]") as string[]),
  };
}

test("auth-email-otp: an emailed one-time code signs an existing account in", async ({ page, user, request, evidence }) => {
  test.skip(!mailer, "WORKSPACE_TEST_MAILER_URL is missing; run through verify.sh drive");
  const sentAfter = Date.now();
  await page.goto("/login");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent").first()).toBeVisible();
  await evidence.shot("01-code-sent");

  const otp = await readOtp(request, user.email, sentAfter);
  await evidence.step("Read the one-time code from Mailpit");

  await page.getByRole("textbox", { name: "Verification code" }).fill(otp);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.reload();
  await expect(page).toHaveURL(/\/app/);
  await evidence.shot("02-signed-in-by-email");
});

test("auth-session-expired: a session the server revoked signs out to the login page with a message", async ({ signedIn: page, evidence }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  // Like an account deleted in another tab or a password reset: the stored
  // tokens are still there, but the server refuses both of them.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => /^debate-auth-[a-z]+$/.test(name));
    if (!key) throw new Error("no stored session");
    const stored = JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>;
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=+$/, "");
    const claims = btoa(JSON.stringify({ sub: "00000000-0000-4000-8000-000000000000", exp: Math.floor(Date.now() / 1000) + 3000 })).replace(/=+$/, "");
    localStorage.setItem(key, JSON.stringify({
      ...stored,
      access_token: `${header}.${claims}.invalid-signature`,
      refresh_token: "x",
      expires_at: Math.floor(Date.now() / 1000) + 3000,
    }));
  });
  await evidence.step("Replaced the stored session with tokens the server refuses");
  await page.reload();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByRole("status").filter({ hasText: "Your session expired. Sign in again." })).toBeVisible();
  await evidence.shot("01-login-session-expired");
  await evidence.aria("01-login-session-expired");
  // The notice is for this sign-out only.
  await page.reload();
  await expect(page.getByText("Your session expired. Sign in again.")).toHaveCount(0);
});

test("auth-email-link: the emailed sign-in link signs in after a failed resend, and a used link says so", async ({ page, user, request, evidence }) => {
  test.skip(!mailer || !supabaseUrl, "Mailpit or LOCAL_SUPABASE_URL is missing; run through verify.sh drive");
  const paths = await recordPaths(page);
  const sentAfter = Date.now();
  await page.goto("/login");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email address").fill(user.email);
  const otpRequest = page.waitForRequest((request) => request.url().includes("/auth/v1/otp"));
  await page.getByRole("button", { name: "Send code" }).click();
  // The link returns to the callback route with this sign-in's own flow id.
  const redirectTo = new URL((await otpRequest).url()).searchParams.get("redirect_to") ?? "";
  expect(redirectTo).toMatch(/^http:\/\/127\.0\.0\.1:18081\/auth\/callback\?sb_flow_id=[0-9a-f]{32}$/);
  await expect(page.getByText("Code sent").first()).toBeVisible();
  const otp = await readOtp(request, user.email, sentAfter);
  await evidence.step(`Sent a code; the link returns to ${redirectTo.replace(/sb_flow_id=.*/, "sb_flow_id=<flow>")}`);

  // AUTH-01: the resend hits Auth's rate limit, and auth-js drops that resend's verifier.
  await expect(page.getByRole("button", { name: /^Resend in 0:\d\d$/ })).toBeDisabled();
  await expireResendCooldown(page);
  await page.route("**/auth/v1/otp**", (route) => route.fulfill({
    status: 429,
    contentType: "application/json",
    body: JSON.stringify({ code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }),
  }));
  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText("Too many attempts. Try again later.")).toBeVisible();
  await page.unroute("**/auth/v1/otp**");
  await evidence.shot("01-resend-rate-limited");

  // The link in prod's email: Auth's /verify with the PKCE token hash of this code.
  const link = `${supabaseUrl}/auth/v1/verify?${new URLSearchParams({
    token: `pkce_${createHash("sha224").update(user.email + otp).digest("hex")}`,
    type: "magiclink",
    redirect_to: redirectTo,
  })}`;
  await paths.clear();
  await page.goto(link);
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(debateControl(page)).toBeVisible();
  // AUTH-17: the callback waits for the exchange; it never shows /login on the way.
  const seen = await paths.seen();
  await evidence.json("02-paths-after-link", seen);
  expect(seen).toContain("/auth/callback");
  expect(seen).not.toContain("/login");
  await page.reload();
  await expect(page).toHaveURL(/\/app$/);
  await evidence.shot("02-signed-in-by-link");
  await evidence.step("Opened the emailed link after the failed resend; signed in on /app without passing /login");

  // AUTH-02: the same link again, in a browser that is no longer signed in.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (/^debate-auth-[a-z]+$/.test(key)) localStorage.removeItem(key);
  });
  await page.goto(link);
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  await expect(page.getByRole("alert")).toHaveText("This sign-in link has expired or was already used. Send a new code.");
  await evidence.shot("03-used-link-message");
  await evidence.aria("03-used-link-message");
  await evidence.step("Opened the used link again; /login says it expired or was used");
});

test("auth-deep-link-email-code: a signed-out deep link signs in by email code and returns to the page", async ({ page, user, request, evidence }) => {
  test.skip(!mailer, "WORKSPACE_TEST_MAILER_URL is missing; run through verify.sh drive");
  // AUTH-14 and AX-06: the deep link goes to /login, which has one <main> and an <h1>.
  await page.goto("/app/generate");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to DebateLab" })).toBeVisible();
  await evidence.aria("01-login-from-deep-link");

  let sentAfter = Date.now();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent", { exact: true })).toBeVisible();
  // AUTH-04: Resend waits out Auth's minimum gap, and says how long.
  await expect(page.getByRole("button", { name: /^Resend in 0:\d\d$/ })).toBeDisabled();
  await evidence.shot("02-code-sent-countdown");
  const firstOtp = await readOtp(request, user.email, sentAfter);

  // AUTH-03: real Auth answers otp_expired for a wrong code; the message says it may be wrong.
  await page.getByRole("textbox", { name: "Verification code" }).fill(firstOtp === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("alert")).toHaveText("That code is wrong or has expired. Check it or send a new one.");
  await evidence.shot("03-wrong-code");

  // AUTH-05: a new send clears the old error.
  await expireResendCooldown(page);
  sentAfter = Date.now();
  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText("New code sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const otp = await readOtp(request, user.email, sentAfter, firstOtp);
  await evidence.step("Wrong code refused, countdown ended, a new code sent");

  await page.getByRole("textbox", { name: "Verification code" }).fill(otp);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/app\/generate$/, { timeout: 20_000 });
  await evidence.shot("04-back-on-generate");
  await evidence.step("Signed in by email code and returned to /app/generate");
});

test("auth-switch-account: the next account on this browser starts on /app, gets its own tour, and sign-out stays local", async ({ signedIn: page, evidence }, testInfo) => {
  const second = await createDemoUser(`${testInfo.project.name}-second`);
  try {
    // The first account (tour already seen) leaves off on Settings and signs out.
    await page.goto("/app/settings");
    const logout = page.waitForRequest((request) => request.url().includes("/auth/v1/logout"));
    await page.getByRole("button", { name: "Sign out" }).click();
    // AUTH-19: this device only.
    expect(new URL((await logout).url()).searchParams.get("scope")).toBe("local");
    await expect(page).toHaveURL(/\/login$/);
    await evidence.step("Signed out from /app/settings with scope=local");

    // AUTH-06: a different account signs in on the same /login page.
    await page.getByRole("tab", { name: "Demo code" }).click();
    await page.getByRole("textbox", { name: "Demo code" }).fill(second.code);
    await page.getByRole("button", { name: "Sign in with demo code" }).click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await evidence.step("Signed in as a second account; landed on /app, not /app/settings");

    // AUTH-07: the second account gets its own tour.
    const tour = page.getByText("Welcome to DebateLab");
    await expect(tour).toBeVisible({ timeout: 10_000 });
    await evidence.shot("01-second-account-tour");
    if (await page.getByRole("button", { name: "Open menu" }).isVisible()) {
      // On phones the tour must not block the header's menu: open it and use it.
      await page.getByRole("button", { name: "Open menu" }).click();
      const menu = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(menu).toBeVisible();
      await evidence.shot("02-menu-open-during-tour");
      await menu.getByRole("link", { name: /History/ }).click();
      await expect(page).toHaveURL(/\/app\/history$/);
      await evidence.step("Opened the menu and went to History while the tour showed");
      // The tour waits on /app and picks up again there.
      await page.goBack();
      await expect(tour).toBeVisible({ timeout: 10_000 });
    }
    await page.locator('[data-test-id="button-skip"]').click();
    await expect(tour).toBeHidden();
    await evidence.step("Skipped the tour");
  } finally {
    await deleteDemoUser(second);
  }
});

// QA round 3: Sign out lives on Settings, and the same account signing back in by
// email code landed on /app/settings ("Opening Settings") instead of /app.
test("auth-same-account-after-sign-out: signing back in by email code after Sign out on Settings opens /app", async ({ signedIn: page, user, request, evidence }) => {
  test.skip(!mailer, "WORKSPACE_TEST_MAILER_URL is missing; run through verify.sh drive");
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await evidence.step("Signed out from /app/settings");

  const sentAfter = Date.now();
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent").first()).toBeVisible();
  const otp = await readOtp(request, user.email, sentAfter);
  await page.getByRole("textbox", { name: "Verification code" }).fill(otp);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByText("Opening Settings")).toHaveCount(0);
  await evidence.shot("01-landed-on-app");
  await evidence.step("The same account signed back in by email code and landed on /app");
});
