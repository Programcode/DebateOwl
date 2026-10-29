import { admin, agentic, AI_TIMEOUT, debateControl, expect, fakeAnswer, LIVE, test } from "./support/fixtures";

const MOTION = "This House would replace school exams with continuous assessment";

test("a student starts a debate and generates a case for it", { ...agentic, tags: ["journey"] }, async ({ app, agent, browser, screen, student }) => {
  await app.open("/app");
  await agent.act("Start a new debate on the motion {motion}. Then open Generate and generate a debate case for that motion.", {
    params: { motion: MOTION },
  });

  await expect(debateControl(browser)).toHaveAttribute("aria-label", `Current debate: ${MOTION}`);
  await expect(screen.getByRole("button", "Regenerate Arguments")).toBeVisible({ timeout: AI_TIMEOUT });

  // The client files the case in its debate after it renders.
  const userId = await student.userId();
  await expect.poll(async () => {
    const { data } = await admin.from("cases").select("debates(motion)").eq("user_id", userId);
    return data;
  }, { timeout: 15_000 }).toEqual([{ debates: { motion: MOTION } }]);

  await agent.assert("The page shows a generated debate case: an opening and several arguments, each with a point and an explanation of why it is true.");
  if (LIVE) {
    // Recipes never assert on model wording; a judge can check that the case is on topic.
    await agent.assert(`The generated case argues about the motion "${MOTION}", not about an unrelated topic.`);
  }

  // The saved case reopens from History.
  await app.open("/app");
  await agent.act("Open History and load the debate case you generated.");
  await expect(screen.getByRole("button", "Regenerate Arguments")).toBeVisible();
  if (!LIVE) await expect(fakeAnswer(screen)).toBeVisible();
  await agent.assert("A debate case with an opening and arguments is open again on screen.");
});
