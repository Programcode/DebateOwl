import { admin, expect, MARK, providerCall, test } from "./fixtures";

// Feature map: features/case-generation.md (gen-create, gen-save).
const motion = "This House would make public transport free";

test("generate a case and save it to the account", async ({ signedIn: page, user, evidence }) => {
  await page.goto("/app/generate");
  await expect(page.getByRole("heading", { name: "Ready to Generate" })).toBeVisible();
  await page.getByRole("textbox", { name: "Motion / Topic *" }).fill(motion);
  await evidence.step(`filled "Motion / Topic *" with "${motion}"`);
  await evidence.aria("01-before-generate");

  await page.getByRole("button", { name: "Generate Debate Case" }).click();
  await evidence.step('clicked "Generate Debate Case"');
  await expect(page.getByText(`${MARK} case thesis`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`${MARK} contention 3`)).toBeVisible();
  await evidence.shot("02-generated");
  await evidence.aria("02-generated");

  // Side effects: what the Edge Function sent upstream, and the usage row it wrote.
  const call = await providerCall("generate");
  expect(call.user).toContain(`Motion: ${motion}`);
  await evidence.json("03-provider-call", { feature: call.feature, model: call.model, userPromptHead: call.user.slice(0, 400) });
  const userId = await user.userId();
  const { data: usage } = await admin.from("ai_requests").select("feature,status").eq("user_id", userId);
  expect(usage).toContainEqual(expect.objectContaining({ feature: "generate", status: "success" }));
  await evidence.json("03-ai-requests", usage);

  const title = `Verify case ${Date.now()}`;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Case title").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await evidence.step(`saved the case as "${title}"`);
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("title").eq("user_id", userId);
    return data?.map((row) => row.title);
  }).toEqual([title]);
  const { data: cases } = await admin.from("cases").select("id,title,created_at").eq("user_id", userId);
  await evidence.json("04-cases-rows", cases);

  // Read-only second view: History in the same session lists the saved case.
  await page.goto("/app/history");
  await expect(page.getByText(title).first()).toBeVisible();
  await evidence.shot("05-history");
  await evidence.aria("05-history");
});
