import { readFile } from "node:fs/promises";
import pg from "pg";
import type { Page } from "@playwright/test";
import { admin, createDemoUser, deleteDemoUser, expect, fake, signIn, stackReady, startDebate, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

const accountUrl = `${process.env.LOCAL_SUPABASE_URL}/functions/v1/account`;

async function addSource(page: Page, title: string, content: string) {
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add Source" }).click();
  await page.getByRole("textbox", { name: "Source title..." }).fill(title);
  await page.getByRole("textbox", { name: "Paste source content..." }).fill(content);
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(page.getByRole("switch", { name: `Toggle ${title}` })).toBeChecked();
}

/** The signed-in browser session's access token, for calling the function directly. */
async function accessToken(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("debate-auth-"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : "";
  });
}

function callAccount(token: string | null, body: unknown) {
  return fetch(accountUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY ?? "",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Every public and private table holding a row whose text contains the id. */
async function tablesMentioning(id: string) {
  const client = new pg.Client({ connectionString: process.env.COLLABORATION_DATABASE_URL });
  await client.connect();
  try {
    const { rows: tables } = await client.query<{ name: string }>(
      "SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables WHERE schemaname IN ('public', 'private')",
    );
    const found: string[] = [];
    for (const { name } of tables) {
      const { rows } = await client.query(`SELECT 1 FROM ${name} AS t WHERE t::text LIKE $1 LIMIT 1`, [`%${id}%`]);
      if (rows.length > 0) found.push(name);
    }
    return found;
  } finally {
    await client.end();
  }
}

async function seedBystander(page: Page, other: Awaited<ReturnType<typeof createDemoUser>>) {
  const context = await page.context().browser()!.newContext();
  const bystander = await context.newPage();
  await bystander.addInitScript(() => localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 })));
  await signIn(bystander, other);
  await startDebate(bystander, "Bystander motion");
  await addSource(bystander, "Bystander study", "BYSTANDER-PRIVATE evidence");
  await context.close();
}

test("Download my data saves the account's own data as JSON", async ({ signedIn: page, user }) => {
  const other = await createDemoUser("export-bystander");
  try {
    await seedBystander(page, other);
    await startDebate(page, "Exported motion");
    await addSource(page, "Exported study", "EXPORTED-PRIVATE evidence");

    await page.goto("/app/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^debatelab-data-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await readFile((await file.path())!, "utf8");
    const exported = JSON.parse(text);

    expect(exported.format).toBe("debatelab-account-export");
    expect(exported.account).toMatchObject({ id: await user.userId(), email: user.email });
    expect(exported.data.debates.map((row: { motion: string }) => row.motion)).toEqual(["Exported motion"]);
    expect(exported.data.sources.map((row: { title: string }) => row.title)).toEqual(["Exported study"]);
    expect(text).not.toContain("BYSTANDER-PRIVATE");

    // Naming another account in the request still returns only the caller's data.
    const response = await callAccount(await accessToken(page), { action: "export", userId: await other.userId() });
    expect(response.status).toBe(200);
    const direct = await response.json();
    expect(direct.account.id).toBe(await user.userId());
    expect(JSON.stringify(direct)).not.toContain("BYSTANDER-PRIVATE");
  } finally {
    await deleteDemoUser(other);
  }
});

test("Delete account removes every row that references the user and nobody else's", async ({ signedIn: page, user }) => {
  const other = await createDemoUser("delete-bystander");
  try {
    await seedBystander(page, other);
    await startDebate(page, "Deleted motion");
    await addSource(page, "Deleted study", "Removed with the account.");
    const userId = await user.userId();
    const otherId = await other.userId();
    expect(await tablesMentioning(userId)).not.toEqual([]);

    // Without a session, or with another account's confirmation, nothing is deleted.
    expect((await callAccount(null, { action: "delete", confirmation: user.email })).status).toBe(401);
    expect((await callAccount(null, { action: "export" })).status).toBe(401);
    const token = await accessToken(page);
    const forged = await callAccount(token, { action: "delete", confirmation: other.email, userId: otherId });
    expect(forged.status).toBe(400);
    expect((await admin.auth.admin.getUserById(userId)).data.user?.id).toBe(userId);
    expect((await admin.auth.admin.getUserById(otherId)).data.user?.id).toBe(otherId);

    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Delete account" })).toBeDisabled();
    await dialog.getByLabel("Type your email to confirm").fill(user.email);
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByText("Account deleted").first()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/$/);

    expect((await admin.auth.admin.getUserById(userId)).data.user).toBeNull();
    expect(await tablesMentioning(userId)).toEqual([]);
    // Billing was checked in Stripe, not only in the database, before anything was deleted.
    const searches = (await fake.requests()).filter((request) => request.feature === "stripe-customer-search");
    expect(searches.map((request) => request.user)).toEqual([`metadata['user_id']:'${userId}'`]);

    expect((await admin.auth.admin.getUserById(otherId)).data.user?.id).toBe(otherId);
    const { data: theirs } = await admin.from("sources").select("title").eq("user_id", otherId);
    expect(theirs?.map((row) => row.title)).toEqual(["Bystander study"]);

    // The deleted session no longer works.
    expect((await callAccount(token, { action: "export" })).status).toBe(401);
  } finally {
    await deleteDemoUser(other);
  }
});
