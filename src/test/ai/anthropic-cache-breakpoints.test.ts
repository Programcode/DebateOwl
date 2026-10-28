import { describe, expect, it } from "vitest";
import { oneBreakpointPerToolMessage, withAnthropicCacheLimit } from "../../../agentic/support/anthropic-cache";

const breakpoint = { type: "ephemeral" };
const result = (id: string) => ({ type: "tool-result", toolCallId: id, toolName: "click", output: { type: "text", value: "ok" } });

describe("Anthropic cache breakpoints on the testing agent's tool messages", () => {
  it("keeps one breakpoint, on the last result, when a turn made parallel tool calls", () => {
    const message = { role: "tool", content: [result("a"), result("b"), result("c")], providerOptions: { anthropic: { cacheControl: breakpoint } } };
    const fixed = oneBreakpointPerToolMessage(message);
    expect(fixed.providerOptions?.anthropic).toEqual({});
    const parts = fixed.content as Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }>;
    expect(parts.map((part) => part.providerOptions?.anthropic?.cacheControl)).toEqual([undefined, undefined, breakpoint]);
  });

  it("leaves single results, other roles and unmarked messages alone", () => {
    const single = { role: "tool", content: [result("a")], providerOptions: { anthropic: { cacheControl: breakpoint } } };
    const user = { role: "user", content: [{ type: "text", text: "hi" }], providerOptions: { anthropic: { cacheControl: breakpoint } } };
    const unmarked = { role: "tool", content: [result("a"), result("b")] };
    for (const message of [single, user, unmarked]) expect(oneBreakpointPerToolMessage(message)).toBe(message);
  });

  it("wraps a model without changing its id or provider", async () => {
    const seen: unknown[] = [];
    const model = {
      modelId: "anthropic/claude-haiku-5.5",
      provider: "openrouter.chat",
      async doGenerate(options: { prompt: unknown[] }) { seen.push(options.prompt); return "ok"; },
    };
    const wrapped = withAnthropicCacheLimit(model);
    expect(wrapped.modelId).toBe("anthropic/claude-haiku-5.5");
    expect(wrapped.provider).toBe("openrouter.chat");
    await wrapped.doGenerate({ prompt: [{ role: "tool", content: [result("a"), result("b")], providerOptions: { anthropic: { cacheControl: breakpoint } } }] });
    const [prompt] = seen as Array<Array<{ content: Array<{ providerOptions?: unknown }> }>>;
    expect(prompt[0].content[0].providerOptions).toBeUndefined();
  });
});
