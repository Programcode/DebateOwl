import { admin, agentic, aiRequestsOf, AI_TIMEOUT, debateControl, expect, fakeAnswer, LIVE, test } from "./support/fixtures";

// One goal per tool, pinned by the ai_requests row the Edge Function wrote,
// the fake provider's marker on screen (fake mode), and a judge reading the
// result. The recipes in verify-debatelab cover the exact response fields.
const options = { ...agentic, tags: ["journey"] };

test("a student finds the weaknesses in an argument", options, async ({ app, agent, screen, student }) => {
  await app.open("/app/attack");
  await agent.act("Enter the argument {argument} and find its weaknesses.", {
    params: { argument: "Free public transport cuts congestion because more people ride the bus." },
  });

  await expect.poll(() => aiRequestsOf(student), { timeout: AI_TIMEOUT }).toContain("attack: success");
  if (!LIVE) await expect(fakeAnswer(screen)).toBeVisible({ timeout: AI_TIMEOUT });
  await agent.assert("The page lists weaknesses in the student's argument, each with an explanation.");
});

test("a student brainstorms a motion and it is filed in a new debate", options, async ({ app, agent, browser, screen, student }) => {
  const motion = "This House would ban zoos";
  await app.open("/app/brainstorm");
  await agent.act("Brainstorm angles on the motion {motion}. If the app offers to start a debate with this motion, start it.", {
    params: { motion },
  });

  await expect(debateControl(browser)).toHaveAttribute("aria-label", `Current debate: ${motion}`);
  if (!LIVE) await expect(fakeAnswer(screen)).toBeVisible({ timeout: AI_TIMEOUT });
  const userId = await student.userId();
  await expect.poll(async () => (await admin.from("brainstorms").select("debates(motion)").eq("user_id", userId)).data, { timeout: 15_000 })
    .toEqual([{ debates: { motion } }]);
  await agent.assert("The page shows brainstormed angles or ideas for the motion, each with a title and an explanation.");
});

test("a student looks up factoids for a statement", options, async ({ app, agent, student }) => {
  await app.open("/app/factoids");
  await agent.act("Find factoids for the statement {statement}.", {
    params: { statement: "Cities with free buses have fewer cars downtown." },
  });

  await expect.poll(() => aiRequestsOf(student), { timeout: AI_TIMEOUT }).toContain("factoids: success");
  // Fake mode has no Exa key, so every factoid is unverified and dropped.
  await agent.assert(LIVE
    ? "The page lists factoids about the statement, each with a source."
    : "The search has finished, and the page either lists factoids or clearly tells the student that no verified factoids were found. It is not stuck loading and shows no error.");
});

test("a student asks the coach a question and gets a streamed answer", options, async ({ app, agent, screen, student }) => {
  await app.open("/app/ask");
  await agent.act("Ask your debate coach: {question}", {
    params: { question: "How do I weigh access against cost in a rebuttal?" },
  });

  await expect.poll(() => aiRequestsOf(student), { timeout: AI_TIMEOUT }).toContain("ask: success");
  if (!LIVE) await expect(screen.getByText(/streamed answer/).first()).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(screen.getByText("Response was interrupted")).toHaveCount(0);
  await agent.assert("The coach has answered the student's question in the chat, and the answer is complete rather than cut off or showing an error.");
});
