import { admin, AI_TIMEOUT, aiResponse, chooseForMotion, expect, expectProviderCalls, fake, followSystemTheme, LIVE, providerCalls, test } from "./fixtures";

// Feature map: features/ai-tools.md.

test("attack-run: Attack analyses a pasted argument", async ({ signedIn: page, evidence }) => {
  const argument = "Free transit cuts congestion because riders leave their cars at home, so cities should abolish fares.";
  await page.goto("/app/attack");
  await page.getByLabel("Your argument *").fill(argument);
  await evidence.step("Attack: pasted an argument and clicked Find weaknesses");
  const response = aiResponse(page, "attack");
  await page.getByRole("button", { name: "Find weaknesses" }).click();
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
  await page.getByLabel("Motion / topic *").fill(motion);
  const response = aiResponse(page, "brainstorm");
  await page.getByRole("button", { name: "Start brainstorming" }).click();
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
  await page.getByRole("button", { name: "Find factoids" }).click();
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
  await page.getByPlaceholder("Ask your debate coach…").fill("In two sentences, how should I weigh access against cost?");
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

/** WCAG contrast of an element's text against the first painted background behind it. */
async function textContrast(page: import("@playwright/test").Page, text: string) {
  return page.evaluate((needle) => {
    // "meta" is the first message's time line, the student's own bubble.
    const target = (needle === "meta"
      ? document.querySelector("[data-testid=message-meta]")
      : [...document.querySelectorAll("p, li, strong")].find((element) => element.textContent?.trim() === needle)) as HTMLElement | null | undefined;
    if (!target) throw new Error(`no element with text ${needle}`);
    const rgb = (value: string) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 4);
    };
    let node: HTMLElement | null = target;
    let background = "rgba(0, 0, 0, 0)";
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      if (rgb(color)[3] > 0) { background = color; break; }
      node = node.parentElement;
    }
    const luminance = ([r, g, b]: number[]) => [r, g, b]
      .map((channel) => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const [fg, bg] = [luminance(rgb(getComputedStyle(target).color)), luminance(rgb(background))];
    return { color: getComputedStyle(target).color, background, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) };
  }, text);
}

// QA round 3: the student's own message was gray on blue (about 2:1), and the
// Hungarian placeholder was cut off at 375 px.
test("ask-bubble: the student's message meets WCAG AA in light and dark, and the placeholder fits at 375 px", async ({ signedIn: page, evidence }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 375, height: 812 });
  await followSystemTheme(page);
  const question = "How should I weigh **access** against cost?";
  await page.goto("/app/ask");
  await page.getByPlaceholder("Ask your debate coach…").fill(question);
  const stream = page.waitForResponse((response) => response.url().endsWith("/functions/v1/ai-stream"), { timeout: AI_TIMEOUT });
  await page.getByRole("button", { name: "Send message" }).click();
  await stream;
  const ratios: Record<string, unknown> = {};
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    for (const [part, text] of [["body", "How should I weigh access against cost?"], ["bold", "access"], ["time", "meta"]] as const) {
      const measured = await textContrast(page, text);
      ratios[`${colorScheme}-${part}`] = measured;
      expect(measured.ratio, `${colorScheme} ${part} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    await evidence.shot(`01-user-bubble-${colorScheme}`);
  }
  await evidence.json("02-contrast", ratios);
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("radio", { name: "Magyar" }).first().click();
  const box = page.getByPlaceholder("Mit kérdeznél?");
  await expect(box).toBeVisible();
  // The whole placeholder fits the field's text area.
  const fits = await box.evaluate((input: HTMLTextAreaElement | HTMLInputElement) => {
    const style = getComputedStyle(input);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { text: ctx.measureText(input.placeholder).width, room };
  });
  await evidence.json("03-hu-placeholder", fits);
  expect(fits.text).toBeLessThanOrEqual(fits.room);
  await evidence.shot("03-hu-placeholder");
});

test("ask-cutoff: a streamed answer cut off at its length cap says so under the answer", async ({ signedIn: page, evidence }) => {
  test.skip(LIVE, "only the fake provider can force a cut-off reply");
  await fake.truncate("ask-stream");
  await page.goto("/app/ask");
  await page.getByPlaceholder("Ask your debate coach…").fill("How should I weigh access against cost?");
  const stream = page.waitForResponse((response) => response.url().endsWith("/functions/v1/ai-stream"), { timeout: AI_TIMEOUT });
  await page.getByRole("button", { name: "Send message" }).click();
  const events = await (await stream).text();
  expect(events).toContain('"replyTruncated":true');
  // The partial answer stays, with the notice under it rather than an error.
  await expect(page.getByText("weigh access against cost.").first()).toBeVisible();
  await expect(page.getByText("This answer hit its length limit and stops early.", { exact: false })).toBeVisible();
  await expect(page.getByText("Response was interrupted")).toHaveCount(0);
  await evidence.shot("01-cut-off-notice");
  const features = (await providerCalls()).map((call) => call.feature);
  expect(features).toEqual(["ask-stream"]);
});

test("ask-cited: Ask in citation mode uses the structured endpoint", async ({ signedIn: page, evidence }) => {
  await page.goto("/app/ask");
  // The Ask switches live in the Options popover above the message box.
  await page.getByRole("button", { name: "Options" }).click();
  await page.locator("#citation-mode").click();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Ask your debate coach…").fill("Which evidence supports fare-free transit?");
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
  // The Ask switches live in the Options popover above the message box.
  await page.getByRole("button", { name: "Options" }).click();
  await page.locator("#web-search-mode").click();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Ask your debate coach…").fill("What did recent studies find about fare-free public transport ridership?");
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
