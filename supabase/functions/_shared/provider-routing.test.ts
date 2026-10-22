import { assertEquals } from "jsr:@std/assert@1.0.19";
import { warnIfClaudeNotByok } from "./provider-routing.ts";

Deno.test("the BYOK guard warns only for Claude usage that left the key or cost credits", () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: string) => warnings.push(message);
  try {
    const claude = "anthropic/claude-haiku-5.5";
    assertEquals(warnIfClaudeNotByok(claude, { is_byok: true, cost: 0 }, "ai"), false);
    assertEquals(warnIfClaudeNotByok(claude, undefined, "ai"), false);
    assertEquals(warnIfClaudeNotByok("openai/gpt-6-luna", { is_byok: false, cost: 0.02 }, "ai"), false);
    assertEquals(warnIfClaudeNotByok(claude, { is_byok: false, cost: 0 }, "ai"), true);
    assertEquals(warnIfClaudeNotByok(claude, { is_byok: true, cost: 0.0004, cost_details: { upstream_inference_cost: 0.008 } }, "ai-stream"), true);
    assertEquals(warnings.length, 2);
    assertEquals(JSON.parse(warnings[1]), {
      event: "claude_not_byok",
      source: "ai-stream",
      model: claude,
      is_byok: true,
      cost: 0.0004,
      upstream_inference_cost: 0.008,
    });
  } finally {
    console.warn = originalWarn;
  }
});
