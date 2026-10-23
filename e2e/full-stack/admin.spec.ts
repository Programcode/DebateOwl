import { admin, createDemoUser, deleteDemoUser, expect, signIn, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

test("an admin publishes an announcement that another user sees", async ({ signedIn: page, user, browser }) => {
  const title = `Maintenance ${Date.now()}`;
  const reader = await createDemoUser("reader");
  const readerContext = await browser.newContext();
  try {
    // Admin is granted out of band, never through demo sign-in.
    await admin.from("user_roles").update({ role: "admin" }).eq("user_id", await user.userId());
    await page.goto("/app/admin");
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
    await page.getByRole("tab", { name: "Announcements" }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Message").fill("DebateLab will be unavailable for ten minutes.");
    await page.getByRole("button", { name: "Create announcement" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const readerPage = await readerContext.newPage();
    await readerPage.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
    await signIn(readerPage, reader);
    await expect(readerPage.getByRole("heading", { name: title })).toBeVisible();
    await readerPage.getByRole("button", { name: `Dismiss announcement: ${title}` }).click();
    await readerPage.reload();
    await expect(readerPage.getByRole("main")).toBeVisible();
    await expect(readerPage.getByRole("heading", { name: title })).toHaveCount(0);
  } finally {
    await readerContext.close();
    await admin.from("admin_announcements").delete().eq("title", title);
    await deleteDemoUser(reader);
  }
});

test("a regular user cannot open the admin dashboard", async ({ signedIn: page }) => {
  await page.goto("/app/admin");
  await expect(page.getByText("Access Denied")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toHaveCount(0);
});

/** The signed-in browser session's access token, for calling the function directly. */
async function accessToken(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("debate-auth-"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : "";
  });
}

// Production's rate_limits had no updated_at, so Set limit failed there (DB-01);
// scripts/test-admin-table-drift-migration.sh replays that shape. This drives the real function.
test("an admin sets a per-user and a global rate limit through the admin function", async ({ signedIn: page, user }) => {
  const limitType = `fullstack_daily_${Date.now()}`;
  const userId = await user.userId();
  await admin.from("user_roles").update({ role: "admin" }).eq("user_id", userId);
  await page.goto("/app/admin");
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
  const token = await accessToken(page);
  const setLimit = (body: Record<string, unknown>) => fetch(`${process.env.LOCAL_SUPABASE_URL}/functions/v1/admin?action=set-limit`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: process.env.SUPABASE_ANON_KEY ?? "", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  try {
    for (const value of [5, 9]) {
      expect((await setLimit({ userId, limitType, limitValue: value })).status).toBe(200);
      expect((await setLimit({ limitType, limitValue: value * 10 })).status).toBe(200);
    }
    // Each second call updated the row the first one wrote; none was added.
    const { data: rows } = await admin.from("rate_limits").select("user_id, limit_value, created_at, updated_at").eq("limit_type", limitType);
    expect(rows?.map((row) => [row.user_id, row.limit_value]).sort()).toEqual([[userId, 9], [null, 90]].sort());
    expect(rows?.every((row) => row.updated_at >= row.created_at)).toBe(true);
  } finally {
    await admin.from("rate_limits").delete().eq("limit_type", limitType);
  }
});
