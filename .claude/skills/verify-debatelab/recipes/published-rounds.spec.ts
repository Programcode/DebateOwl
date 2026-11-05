import type { Page } from "@playwright/test";
import { admin, AI_TIMEOUT, expect, test } from "./fixtures";

// The /ai-debate mini round published as a public page: opt-in only, personal
// data removed on the server, thin or redacted rounds noindex, and the delete
// token taking the page down. No sign-in: the demo has no account.

const LONG_ARGUMENT = "Phones pull attention away from lessons every few minutes, and a pupil who checks a notification needs time to find the thread of the lesson again. Teachers lose minutes each period policing screens instead of teaching.";
const LONG_REPLY = "The office phone covers real emergencies, and parents already call it. A ban also removes the pressure to answer group chats during class, which is where most online bullying starts.";

async function playRound(page: Page, motion: string, argument: string, reply: string) {
  await page.goto("/ai-debate");
  await page.getByLabel("Motion").selectOption({ label: "Write my own motion" });
  await page.getByLabel("Your motion").fill(motion);
  await page.getByLabel("Your argument").fill(argument);
  // Cloudflare's test site key passes the bot check by itself.
  const submit = page.getByRole("button", { name: "Get the AI’s rebuttal" });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await expect(page.getByTestId("demo-rebuttal").first()).toBeVisible({ timeout: AI_TIMEOUT });
  await page.getByLabel("Your reply (one more turn)").fill(reply);
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByTestId("demo-rebuttal").nth(1)).toBeVisible({ timeout: AI_TIMEOUT });
}

async function publishedRows(motionPrefix: string) {
  const { data, error } = await admin.from("published_demo_rounds").select("*").like("motion", `${motionPrefix}%`);
  expect(error).toBeNull();
  return data ?? [];
}

test.beforeEach(async () => {
  // Three demo sessions per IP a day: every test starts from none.
  await admin.from("demo_round_sessions").delete().gte("turns", 0);
});

test("a finished round stays private until opted in, loses its personal data, and is noindex", async ({ page, evidence }, testInfo) => {
  const motion = `This House would ban phones in class (${testInfo.project.name})`;
  await playRound(page, motion, `My name is Anna Kovács, write to anna.k@example.com. ${LONG_ARGUMENT}`, LONG_REPLY);
  await evidence.step("played two turns with a name and an email in the argument");

  const consent = page.getByRole("checkbox", { name: /Publish this round as a public page/ });
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Publish round" })).toBeDisabled();
  expect(await publishedRows(motion), "nothing is stored before the opt-in").toEqual([]);
  await evidence.shot("01-private-by-default");
  await evidence.aria("01-private-by-default", page.getByTestId("demo-publish"));

  await consent.check();
  await page.getByRole("button", { name: "Publish round" }).click();
  await expect(page.getByTestId("demo-published")).toContainText("We removed 2 personal details");
  await expect(page.getByTestId("demo-published-indexing")).toContainText("search engines are asked not to list it");
  await evidence.step("ticked the opt-in and published");
  await evidence.shot("02-published");

  const [row] = await publishedRows(motion);
  await evidence.json("02-row", { ...row, delete_token_hash: "<sha256>" });
  expect(row.indexable).toBe(false);
  expect(JSON.stringify(row.turns)).not.toMatch(/Anna|Kovács|example\.com/);
  expect(JSON.stringify(row.turns)).toContain("[email removed]");
  expect(row.delete_token_hash).toMatch(/^[0-9a-f]{64}$/);

  // The table is closed to clients; the public reader returns no token hash or session.
  const anon = await fetch(`${process.env.LOCAL_SUPABASE_URL}/rest/v1/published_demo_rounds?select=*`, {
    headers: { apikey: process.env.LOCAL_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.LOCAL_SUPABASE_ANON_KEY}` },
  });
  expect(anon.ok, "anon select on the table").toBe(false);
  const reader = await fetch(`${process.env.LOCAL_SUPABASE_URL}/rest/v1/rpc/get_published_demo_round`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.LOCAL_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.LOCAL_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ p_slug: row.slug }),
  });
  const [publicRow] = await reader.json() as Array<Record<string, unknown>>;
  expect(Object.keys(publicRow).sort()).toEqual(["indexable", "motion", "published_at", "side", "slug", "turns"]);

  await page.getByRole("link", { name: "Open your public round" }).click();
  await expect(page).toHaveURL(new RegExp(`/ai-debate/round/${row.slug}$`));
  await expect(page.getByTestId("published-motion")).toHaveText(motion);
  await expect(page.getByText("[email removed]")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await evidence.shot("03-public-page-noindex");
  await evidence.aria("03-public-page-noindex", page.locator("main"));

  await page.getByRole("button", { name: "Unpublish this round" }).click();
  await expect(page.getByTestId("published-missing")).toHaveText("This round is not published");
  expect(await publishedRows(motion), "the delete token removed the row").toEqual([]);
  await evidence.step("unpublished from the round page");
  await evidence.shot("04-unpublished");
});

test("a substantial round with nothing redacted is indexable, with a canonical URL", async ({ page, evidence }, testInfo) => {
  const motion = `This House would ban homework (${testInfo.project.name})`;
  try {
    await playRound(page, motion, LONG_ARGUMENT, LONG_REPLY);
    await page.getByRole("checkbox", { name: /Publish this round as a public page/ }).check();
    await page.getByRole("button", { name: "Publish round" }).click();
    await expect(page.getByTestId("demo-published-indexing")).toHaveText("Anyone with the link can read it, and search engines may list it.");
    const [row] = await publishedRows(motion);
    expect(row.indexable).toBe(true);
    await evidence.json("01-row", { ...row, delete_token_hash: "<sha256>" });

    await page.getByRole("link", { name: "Open your public round" }).click();
    await expect(page.getByTestId("published-motion")).toHaveText(motion);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://debateowl.com/ai-debate/round/${row.slug}`);
    await evidence.shot("02-public-page-indexable");
  } finally {
    await admin.from("published_demo_rounds").delete().eq("motion", motion);
  }
});
