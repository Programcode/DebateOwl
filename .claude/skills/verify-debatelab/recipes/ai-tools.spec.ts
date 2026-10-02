import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, expectProviderCalls, LIVE, providerCalls, test } from "./fixtures";

// Feature map: features/ai-tools.md.

test("attack-run: Attack analyses a pasted argument", async ({ signedIn: page, evidence }) => {
  const argument = "Free transit cuts congestion because riders leave their cars at home, so cities should abolish fares.";
  await page.goto("/app/attack");
  await page.getByLabel("Your Argument *").fill(argument);
  await evidence.step("Attack: pasted an argument and clicked Find Weaknesses");
  const response = aiResponse(page, "attack");
  await page.getByRole("button", { name: "Find Weaknesses" }).click();
  const body = await response;
  await evidence.json("01-attack-response", body);
  const weaknesses = body.output.weaknesses as Array<{ description: string }>;
  expect(weaknesses.length).toBeGreaterThan(0);
  await expect(page.getByText(weaknesses[0].description).first()).toBeVisible();
  await evidence.shot("02-attack-result");
  const call = (await expectProviderCalls(["attack"])).find((item) => item.feature === "attack")!;
  expect(call.user).toContain("riders leave their cars at home");
});

test("brainstorm-run: Brainstorm returns ranked angles", async ({ signedIn: page, user, evidence }) => {
  const motion = "Universal basic income should replace targeted welfare";
  await page.goto("/app/brainstorm");
  await page.getByLabel("Motion / Topic *").fill(motion);
  const response = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start Brainstorming" }).click();
  // A new account has no Current Debate, so Brainstorm first offers one for this motion.
  await chooseForMotion(page, "create");
  await evidence.step(`Brainstorm: "${motion}", accepted the offer to start a debate for it`);
  const body = await response;
  await evidence.json("01-brainstorm-response", body);
  const topFive = body.output.topFive as Array<{ idea: { title: string } }>;
  expect(topFive.length).toBeGreaterThan(0);
  await expect(page.getByText(topFive[0].idea.title).first()).toBeVisible();
  await evidence.shot("02-brainstorm-result");
  const call = (await expectProviderCalls(["brainstorm"])).find((item) => item.feature === "brainstorm")!;
  expect(call.user).toContain(`Motion: ${motion}`);
  // The result is saved in the debate the offer created.
  await expect.poll(async () => {
    const { data } = await admin.from("brainstorms").select("debates(motion)").eq("user_id", await user.userId());
    return data;
  }).toEqual([{ debates: { motion } }]);
});

test("factoids-run: Factoids researches a statement and keeps only verified citations", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/factoids");
  await page.getByLabel("Statement *").fill("Fare-free public transport increases ridership");
  const response = aiResponse(page, "factoids");
  await page.getByRole("button", { name: "Find Factoids" }).click();
  const body = await response;
  await evidence.json("01-factoids-response", body);
  const factoids = body.output.factoids as Array<{ shortClaim: string; citation: { url?: string; verified: string } }>;
  if (LIVE) {
    expect(factoids.length, "verified factoids").toBeGreaterThan(0);
    for (const factoid of factoids) {
      expect(factoid.citation.verified).toBe("verified");
      expect(factoid.citation.url).toMatch(/^https?:\/\//);
    }
    await expect(page.getByText(factoids[0].shortClaim).first()).toBeVisible();
  } else {
    // No Exa key in fake mode: every unverified factoid must be dropped, not invented.
    expect(factoids).toEqual([]);
    test.info().annotations.push({ type: "unverified", description: "verified citations need --live (Exa)" });
  }
  await evidence.shot("02-factoids-result");
  await expectProviderCalls(["factoids"]);
});

test("ask-stream: Ask streams a coaching answer and records usage", async ({ signedIn: page, user, evidence }) => {
  await page.goto("/app/ask");
  await page.getByPlaceholder("Ask your debate coach...").fill("In two sentences, how should I weigh access against cost?");
  const stream = page.waitForResponse((response) => response.url().endsWith("/functions/v1/ai-stream"), { timeout: AI_TIMEOUT });
  await page.getByRole("button", { name: "Send message" }).click();
  const response = await stream;
  expect(response.status()).toBe(200);
  const events = await response.text();
  // A 200 stream can still end early; only the final event proves a complete answer.
  expect(events).toContain("event: final");
  expect(events).not.toContain("event: error");
  await evidence.json("01-stream-events", events.split("\n\n").slice(-6));
  await expect(page.getByText("Response was interrupted")).toHaveCount(0);
  await evidence.shot("02-streamed-answer");
  // The client silently falls back to the structured endpoint if streaming fails.
  const features = (await providerCalls()).map((call) => call.feature);
  expect(features).toContain("ask-stream");
  expect(features).not.toContain("ask");
  await expect.poll(async () => {
    const { data } = await admin.from("ai_requests").select("feature,status").eq("user_id", await user.userId());
    return data;
  }, { timeout: AI_TIMEOUT }).toContainEqual(expect.objectContaining({ feature: "ask", status: "success" }));
});

test("ask-cited: Ask in citation mode uses the structured endpoint", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/ask");
  await page.locator("#citation-mode").click();
  await page.getByPlaceholder("Ask your debate coach...").fill("Which evidence supports fare-free transit?");
  const response = aiResponse(page, "ask");
  await page.getByRole("button", { name: "Send message" }).click();
  const body = await response;
  await evidence.json("01-ask-response", body);
  expect(typeof body.output.response).toBe("string");
  await evidence.shot("02-cited-answer");
  await expectProviderCalls(["ask"]);
});

test("ask-web: Ask with web search shows the sources it used", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/ask");
  await page.locator("#web-search-mode").click();
  await page.getByPlaceholder("Ask your debate coach...").fill("What did recent studies find about fare-free public transport ridership?");
  const response = aiResponse(page, "ask");
  await page.getByRole("button", { name: "Send message" }).click();
  const body = await response;
  await evidence.json("01-ask-web-response", body);
  await evidence.shot("02-ask-web");
  if (!LIVE) {
    test.info().annotations.push({ type: "unverified", description: "web search needs --live (Exa)" });
    return;
  }
  const searchInfo = body.output.searchInfo as { webSearchUsed: boolean; sources: Array<{ url: string }> };
  expect(searchInfo.webSearchUsed).toBe(true);
  expect(searchInfo.sources.length).toBeGreaterThan(0);
  await expect(page.getByText("Web research used:")).toBeVisible();
});
