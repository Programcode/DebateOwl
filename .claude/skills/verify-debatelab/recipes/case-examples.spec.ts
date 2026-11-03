import { admin, aiResponse, debateControl, expect, LIVE, providerCalls, test } from "./fixtures";

// Generates the samples on the public /debate-case-example page through the real
// app: Login, Start debate with a format, Generate as R1, then R2 in the same debate.
// It spends live model and Exa calls, so it runs only when asked:
//   VERIFY_LIVE_MODEL=anthropic/claude-sonnet-5.5 $H up --live
//   CASE_EXAMPLES=all $H drive recipes/case-examples --project desktop-chromium   (or CASE_EXAMPLES=bp-en)
// scripts/case-examples/README.md says how the evidence becomes the committed raw files.
const SAMPLES = [
  { id: "bp-en", motion: "This House would lower the voting age to 16", format: "British Parliamentary", side: "In favor", language: undefined },
  { id: "policy-en", motion: "Resolved: The United States federal government should substantially increase its investment in high-speed rail", format: "Policy", side: "Against", language: undefined },
  { id: "classroom-hu", motion: "Ez a Ház betiltaná a házi feladatot az általános iskolákban", format: "Classroom", side: "In favor", language: "Magyar" },
] as const;

const selected = process.env.CASE_EXAMPLES;

for (const sample of SAMPLES) {
  test(`case example ${sample.id}`, async ({ signedIn: page, user, evidence }) => {
    test.skip(!LIVE || !selected || (selected !== "all" && selected !== sample.id), "set CASE_EXAMPLES on a live stack to generate the public samples");
    test.setTimeout(30 * 60_000);

    if (sample.language) {
      await page.getByRole("button", { name: "Language", exact: true }).first().click();
      await page.getByRole("radiogroup", { name: "AI output language" }).getByRole("radio", { name: sample.language }).click();
      await page.keyboard.press("Escape");
      await evidence.step(`AI output language: ${sample.language}`);
    }

    if (!page.url().includes("/app")) await page.goto("/app");
    await debateControl(page).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motion").fill(sample.motion);
    await dialog.getByRole("combobox", { name: "Format" }).click();
    await page.getByRole("option", { name: sample.format, exact: true }).click();
    await evidence.shot("00-start-debate");
    await dialog.getByRole("button", { name: "Start debate" }).click();
    await expect(dialog).toBeHidden();
    await evidence.step(`Started debate "${sample.motion}" with format ${sample.format}`);

    await page.goto("/app/generate");
    await expect(page.getByRole("heading", { name: "Your case will appear here" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Motion / topic *" })).toHaveValue(sample.motion);
    await page.getByRole("combobox", { name: "Side" }).click();
    await page.getByRole("option", { name: sample.side, exact: true }).click();

    for (const role of ["R1 - Rebuttal/Arg (6 min)", "R2 - Rebuttal/Build (6 min)"]) {
      const key = role.startsWith("R1") ? "r1" : "r2";
      await page.getByRole("combobox", { name: "Speaker Role" }).click();
      await page.getByRole("option", { name: role }).click();
      const before = (await providerCalls()).length;
      const response = aiResponse(page, "generate");
      const requestPromise = page.waitForRequest((request) => request.url().endsWith("/functions/v1/ai") && request.method() === "POST");
      await page.getByRole("button", { name: "Generate debate case" }).click();
      const request = await requestPromise;
      const body = await response;
      await evidence.json(`${key}-request`, request.postDataJSON());
      await evidence.json(`${key}-response`, body);
      await evidence.json(`${key}-provider-calls`, (await providerCalls()).slice(before));
      const thesis = (body.output as { caseStructure: { thesis: string } }).caseStructure.thesis;
      await expect(page.getByText(thesis).first()).toBeVisible();
      await evidence.shot(`${key}-generated`);
      await evidence.step(`Generated ${key}`);
    }

    const userId = await user.userId();
    const { data: requests } = await admin.from("ai_requests").select("*").eq("user_id", userId);
    await evidence.json("ai-requests", requests);
    const { data: cases } = await admin.from("cases").select("id,title,side,created_at,debates(motion,settings)").eq("user_id", userId);
    await evidence.json("case-rows", cases);
  });
}
