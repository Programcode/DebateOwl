import { admin, expect, MARK, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

test("a demo code signs in, survives reload, and signs out", async ({ signedIn: page, user }) => {
  const userId = await user.userId();
  // demo-code-login provisions a Pro demo account; entitlement checks depend on it.
  const { data: settings } = await admin.from("user_settings").select("subscription_tier,daily_limit_override").eq("user_id", userId).single();
  expect(settings).toEqual({ subscription_tier: "pro", daily_limit_override: 999 });

  await page.reload();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/settings");
  await expect(page.getByText(user.email).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/app/generate");
  await expect(page).toHaveURL(/\/login/);
});

test("an unknown demo code is rejected by the real function", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Demo code" }).click();
  await page.getByRole("textbox", { name: "Demo code" }).fill("DEMO-ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "Sign in with demo code" }).click();

  await expect(page.getByRole("alert")).toHaveText("Demo code not found.");
  await expect(page).toHaveURL(/\/login/);
});

test("an expired access token refreshes before an AI request", async ({ signedIn: page }) => {
  // Returning to a tab after the token expired is the common real-world case
  // for session races between the auth client and AI requests.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.startsWith("debate-auth-"))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill("This House would make public transport free");
  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });
});
