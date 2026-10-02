import { expect, test } from "./fixtures";

// Feature map: features/auth.md. Demo-code sign-in, reload, rejection, and
// sign-out are covered by e2e/full-stack/auth.spec.ts, which drive also runs.

const mailer = process.env.WORKSPACE_TEST_MAILER_URL;

test("auth-email-otp: an emailed one-time code signs an existing account in", async ({ page, user, request, evidence }) => {
  test.skip(!mailer, "WORKSPACE_TEST_MAILER_URL is missing; run through verify.sh drive");
  const sentAfter = Date.now();
  await page.goto("/login");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Code sent").first()).toBeVisible();
  await evidence.shot("01-code-sent");

  // Read the real message from the local Mailpit inbox.
  let otp = "";
  await expect.poll(async () => {
    const payload = await (await request.get(`${mailer}/api/v1/messages`)).json() as { messages?: Array<Record<string, unknown>> };
    for (const message of payload.messages ?? []) {
      if (!JSON.stringify(message).includes(user.email)) continue;
      if (Date.parse(String(message.Created ?? 0)) < sentAfter - 5_000) continue;
      const detail = await (await request.get(`${mailer}/api/v1/message/${message.ID}`)).text();
      otp = detail.match(/\b(\d{6})\b/)?.[1] ?? "";
      if (otp) break;
    }
    return otp;
  }, { timeout: 30_000 }).toMatch(/^\d{6}$/);
  await evidence.step("Read the one-time code from Mailpit");

  await page.getByRole("textbox", { name: "Verification code" }).fill(otp);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.reload();
  await expect(page).toHaveURL(/\/app/);
  await evidence.shot("02-signed-in-by-email");
});
