import { agentic, expect, test } from "./support/fixtures";

// Submitting an AI tool's form empty shows the field's message and starts
// nothing. A resolver that cannot read zod 4's errors threw them as an
// unhandled rejection instead, which the fixture's page-error check catches.
const FORMS = [
  { path: "/app/generate", message: "Motion is required" },
  { path: "/app/attack", message: "Case text is required" },
  { path: "/app/brainstorm", message: "Motion is required" },
  { path: "/app/factoids", message: "Claim is required" },
];

for (const { path, message } of FORMS) {
  test(`${path} explains an empty submit`, { ...agentic, tags: ["forms"] }, async ({ app, browser, screen }) => {
    await app.open(path);
    const submit = browser.locator('main form button[type="submit"]').first();
    await expect(submit).toBeEnabled();
    await submit.tap();
    await expect(screen.getByText(message).first()).toBeVisible();
    await expect(screen.getByRole("dialog")).toHaveCount(0);
  });
}
