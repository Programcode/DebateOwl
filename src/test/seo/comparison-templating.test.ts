import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// scripts/check_templating.py fails when a sentence of more than 12 words appears on
// more than two of the seven comparison pages in public/, so the pages stay distinct.
describe("comparison pages", () => {
  it("share no long sentence across more than two pages", () => {
    let output = "";
    try {
      output = execFileSync("python3", ["scripts/check_templating.py"], { encoding: "utf8" });
    } catch (error) {
      const failure = error as { stdout?: string };
      throw new Error(failure.stdout || String(error));
    }
    expect(output).toContain("Templating check passed");
  });
});
