import { agentic, debateControl, debatesOf, expect, firstRunTest as test } from "./support/fixtures";

const MOTION = "This House would make debate compulsory in secondary schools";

// The onboarding copy and step order change often. The goal stays the same:
// a new student finishes the tour with their first debate started.
test("a new student starts their first debate from the onboarding tour", { ...agentic, tags: ["journey"] }, async ({ agent, browser, student }) => {
  await agent.act("Follow the onboarding tour. At its first step, start a debate on the motion {motion}, then go through the remaining steps until the tour is finished.", {
    params: { motion: MOTION },
  });

  await expect(debateControl(browser)).toHaveAttribute("aria-label", `Current debate: ${MOTION}`);
  await expect(browser.locator(".react-joyride__tooltip")).toHaveCount(0);
  expect((await debatesOf(student)).map((debate) => debate.motion)).toEqual([MOTION]);
  await agent.assert("The onboarding tour is closed and the app shows the new motion as the current debate.");
});
