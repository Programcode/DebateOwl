import { admin, agentic, AI_TIMEOUT, expect, fakeAnswer, LIVE, test } from "./support/fixtures";

const options = { ...agentic, tags: ["journey"] };

// A whole round as one goal: the opponent answers between speeches, so the
// next speech box appears only after a model call.
test("a student practises a full sparring round and gets a verdict", options, async ({ app, agent, screen, student }) => {
  const motion = "This House would lower the voting age to 16";
  await app.open("/app/sparring");
  await agent.act(
    "Start a Lincoln-Douglas sparring round on the motion {motion}. If the app offers to start a debate with this motion, start it. Then deliver each of your speeches by typing {speech} and submitting it, until the round ends and the verdict is shown.",
    { params: { motion, speech: "Sixteen-year-olds pay taxes and should have a say in how that money is spent." } },
  );

  await expect(screen.getByRole("heading", "Here is what happened in the room.")).toBeVisible({ timeout: AI_TIMEOUT * 2 });
  const userId = await student.userId();
  await expect.poll(async () => (await admin.from("sparring_sessions").select("status, debates(motion)").eq("user_id", userId)).data, { timeout: 15_000 })
    .toEqual([{ status: "complete", debates: { motion } }]);
  await agent.assert("The round is over and the page shows the judge's verdict with feedback on the student's speeches.");
});

test("a student cross-examines the AI and gets a debrief", options, async ({ app, agent, screen, student }) => {
  const motion = "This House would make public transport free";
  await app.open("/app/crossfire");
  await agent.act(
    "Start a Crossfire in which you question the AI, on the resolution {motion} with the argument {argument}. If the app offers to start a debate with this motion, start it. Ask {question}, wait for the answer, then end the crossfire.",
    {
      params: {
        motion,
        argument: "Fares keep the poorest riders off the bus.",
        question: "What evidence links free fares to fewer cars?",
      },
    },
  );

  await expect(screen.getByTestId("crossfire-debrief")).toBeVisible({ timeout: AI_TIMEOUT });
  if (!LIVE) await expect(fakeAnswer(screen)).toBeVisible();
  const userId = await student.userId();
  await expect.poll(async () => (await admin.from("crossfires").select("title, debates(motion)").eq("user_id", userId)).data, { timeout: 15_000 })
    .toEqual([{ title: motion, debates: { motion } }]);
  await agent.assert("The crossfire has ended and the page shows a debrief of the exchange with feedback for the student.");
});
