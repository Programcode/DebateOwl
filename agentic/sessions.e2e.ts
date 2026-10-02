import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { createDemoUser, stackReady } from "../e2e/full-stack/stack-core";

// The signed-in start for `verify.sh e2e explore --session student`. Explore
// runs only this setup. The user lives until `verify.sh down` wipes the stack.
test.setup("a student signs in for exploration", { sessions: ["student"] }, async ({ app, screen, browser, session }) => {
  if (!stackReady) throw new Error("No verification stack environment; run through verify.sh e2e");
  const user = await createDemoUser("explore");
  await app.open("/login");
  await browser.evaluate(() => {
    localStorage.setItem("debate-trainer-onboarding", JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 }));
    return null;
  });
  await browser.reload();
  // A plain fill, not a Secret: the code is a throwaway local one, and a Secret
  // fill would withhold the explorer's screenshots for the whole run.
  await screen.getByRole("tab", "Demo code").tap();
  await screen.getByRole("textbox", "Demo code").fill(user.code);
  await screen.getByRole("button", "Sign in with demo code").tap();
  await browser.waitForURL(/\/app$/, { timeout: 20_000 });
  await expect(browser.locator('[data-testid="home-current-debate"]')).toBeVisible();
  await session.save("student");
});
