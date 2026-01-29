import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockState, setMockInvokeResponse, supabaseMock } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/client", () => ({ supabase: supabaseMock }));

import { generateCase } from "@/lib/ai/client";

describe("ai client", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("invokes edge function with access token and output", async () => {
    setMockInvokeResponse({ output: { ok: true } });

    const result = await generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "Policy",
        role: "introductor",
        length: "short",
        audience: "general",
        tone: "neutral",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    );

    expect(result).toEqual({ ok: true });
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("ai", expect.objectContaining({
      headers: { Authorization: "Bearer test-token" },
      body: expect.objectContaining({ provider: "google" }),
    }));
  });

  it("maps lovable provider to openai", async () => {
    setMockInvokeResponse({ output: { ok: true } });

    await generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "Policy",
        role: "introductor",
        length: "short",
        audience: "general",
        tone: "neutral",
      },
      { provider: "lovable", model: "gpt-4o-mini", temperature: 0.7 }
    );

    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("ai", expect.objectContaining({
      body: expect.objectContaining({ provider: "openai" }),
    }));
  });

  it("throws when edge function returns no output", async () => {
    setMockInvokeResponse({ output: null });

    await expect(generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "Policy",
        role: "introductor",
        length: "short",
        audience: "general",
        tone: "neutral",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    )).rejects.toThrow("AI response missing output");
  });
});
