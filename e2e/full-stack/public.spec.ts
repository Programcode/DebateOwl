import { randomUUID } from "node:crypto";
import { admin, expect, stackReady, test } from "./stack";

test.skip(!stackReady, "Local full stack is required (run ./.superset/db-gate.sh)");

test("a share link opens for a signed-out visitor", async ({ page }) => {
  const code = randomUUID().slice(0, 8);
  const title = `Shared case ${code}`;
  await admin.from("shared_items").insert({ share_code: code, item_type: "case", title, item_data: { thesis: "Free transit is a net public good" } });
  try {
    await page.goto(`/share/${code}`);
    await expect(page.getByText(title)).toBeVisible();
    await page.goto("/share/does-not-exist");
    await expect(page.getByText("This shared content is no longer available")).toBeVisible();
  } finally {
    await admin.from("shared_items").delete().eq("share_code", code);
  }
});
