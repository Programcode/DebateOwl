import { admin, chooseForMotion, expect, stackReady, startDebate, test } from "../full-stack/stack";
import { aiResponse, expectProviderCallsHealthy, LIVE_TIMEOUT } from "./live";

test.skip(!stackReady, "Live gate is required (LIVE_PROVIDERS=1 ./.superset/db-gate.sh)");
test.describe.configure({ timeout: LIVE_TIMEOUT + 60_000 });

const httpLink = /^https?:\/\//;

test("case generation researches the web and cites what it found", async ({ signedIn: page, user }) => {
  await page.goto("/app/generate");
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill("This House would make public transport free at the point of use");
  const response = aiResponse(page, "generate");
  await page.getByRole("button", { name: "Generate debate case" }).click();
  await chooseForMotion(page, "once");
  const body = await response;

  // Standard length asks for exactly three contentions.
  expect(body.output.contentions).toHaveLength(3);
  const sources = body.discoveredSources as Array<{ url: string }>;
  expect(sources.length, "web sources found by research").toBeGreaterThan(0);
  expect(sources.every((source) => httpLink.test(source.url))).toBe(true);

  const panel = page.getByText("Researched sources").locator("..");
  await expect(panel).toBeVisible();
  // The sources are folded under the result header; open them.
  await page.getByText("Researched sources").click();
  await expect(panel.getByRole("link").first()).toHaveAttribute("href", httpLink);

  const { data } = await admin.from("ai_requests").select("feature,status").eq("user_id", await user.userId()).eq("feature", "generate");
  expect(data).toEqual([expect.objectContaining({ status: "success" })]);
  await expectProviderCallsHealthy(["generate"]);
});

test("Factoids returns verified evidence with working citations", async ({ signedIn: page }) => {
  await page.goto("/app/factoids");
  await page.getByLabel("Statement *").fill("Fare-free public transport increases ridership");
  const response = aiResponse(page, "factoids");
  await page.getByRole("button", { name: "Find Factoids" }).click();
  const body = await response;

  // The server keeps only factoids whose citation matches fetched research.
  const factoids = body.output.factoids as Array<{ shortClaim: string; citation: { url?: string; verified: string } }>;
  expect(factoids.length, "verified factoids").toBeGreaterThan(0);
  for (const factoid of factoids) {
    expect(factoid.citation.verified).toBe("verified");
    expect(factoid.citation.url).toMatch(httpLink);
  }
  await expect(page.getByText(factoids[0].shortClaim).first()).toBeVisible();
  await expectProviderCallsHealthy(["factoids"]);
});

test("Ask with web search shows the sources it used", async ({ signedIn: page }) => {
  await page.goto("/app/ask");
  // The Ask switches live in the Options popover above the message box.
  await page.getByRole("button", { name: "Options" }).click();
  await page.locator("#web-search-mode").click();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Ask your debate coach...").fill("What did recent studies find about fare-free public transport ridership?");
  const response = aiResponse(page, "ask");
  await page.getByRole("button", { name: "Send message" }).click();
  const body = await response;

  const searchInfo = body.output.searchInfo as { webSearchUsed: boolean; sources: Array<{ url: string }> };
  expect(searchInfo.webSearchUsed).toBe(true);
  expect(searchInfo.sources.length).toBeGreaterThan(0);
  await expect(page.getByText("Web research used:")).toBeVisible();
  await expectProviderCallsHealthy(["ask"]);
});

test("a web page imports into the Library", async ({ signedIn: page, user }) => {
  const url = "https://en.wikipedia.org/wiki/Free_public_transport";
  // Sources belong to a debate, so the Library needs a Current Debate first.
  await startDebate(page, "This House would make public transport free");
  await page.goto("/app/library");
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByRole("textbox", { name: "Import from URL" }).fill(url);
  await page.getByRole("button", { name: "Import URL" }).click();
  await expect(page.getByText("Import preview", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Save imported source" }).click();

  await expect.poll(async () => {
    const { data } = await admin.from("sources").select("origin,content").eq("user_id", await user.userId());
    return data?.map((row) => ({ origin: row.origin, long: row.content.length > 2_000 }));
  }).toEqual([{ origin: url, long: true }]);
});
