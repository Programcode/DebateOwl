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
