import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockState, setMockInvokeResponse, setMockSessionToken, supabaseMock } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/client", () => ({ supabase: supabaseMock }));

import { generateCase, AIAuthError, AIRateLimitError, AIResponseError, AIError } from "@/lib/ai/client";

describe("ai client", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("invokes edge function with access token and output", async () => {
    // Provide a properly formatted response with all required fields
    const mockResponse = {
      caseStructure: { thesis: "Test thesis", framework: "Test framework", keyDefinitions: [], burdenOfProof: "Test burden" },
      contentions: [{ id: "1", claim: "Test claim", reasoning: "Test reasoning", evidence: "Test evidence", needsSource: false, sourceQuery: "", impact: "Test impact" }],
      predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
      counters: [{ targetArgument: "Test target", counterpoint: "Test counter", rebuttal: "Test rebuttal" }],
      metadata: { side: "pro" as const, format: "custom", generatedAt: "2026-01-01T00:00:00Z" },
    };
    setMockInvokeResponse({ output: mockResponse });

    const result = await generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "custom",
        role: "intro",
        length: "standard",
        audience: "intermediate",
        tone: "formal",
        language: "en",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    );

    expect(result).toEqual(mockResponse);
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("ai", expect.objectContaining({
      headers: { Authorization: "Bearer test-token" },
      body: expect.objectContaining({ provider: "google" }),
    }));
  });

  it("maps lovable provider to openai", async () => {
    const mockResponse = {
      caseStructure: { thesis: "Test thesis", framework: "Test framework", keyDefinitions: [], burdenOfProof: "Test burden" },
      contentions: [{ id: "1", claim: "Test", reasoning: "Test", evidence: "Test", needsSource: false, sourceQuery: "", impact: "Test" }],
      predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
      counters: [{ targetArgument: "Test", counterpoint: "Test", rebuttal: "Test" }],
      metadata: { side: "pro" as const, format: "custom", generatedAt: "2026-01-01T00:00:00Z" },
    };
    setMockInvokeResponse({ output: mockResponse });

    await generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "custom",
        role: "intro",
        length: "standard",
        audience: "intermediate",
        tone: "formal",
        language: "en",
      },
      { provider: "lovable", model: "gpt-4o-mini", temperature: 0.7 }
    );

    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("ai", expect.objectContaining({
      body: expect.objectContaining({ provider: "openai" }),
    }));
  });

  it("throws AIResponseError when edge function returns no output", async () => {
    setMockInvokeResponse({ output: null });

    await expect(generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "custom",
        role: "intro",
        length: "standard",
        audience: "intermediate",
        tone: "formal",
        language: "en",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    )).rejects.toThrow(AIResponseError);
  });

  it("throws AIAuthError when no access token available", async () => {
    setMockSessionToken(null);

    await expect(generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "custom",
        role: "intro",
        length: "standard",
        audience: "intermediate",
        tone: "formal",
        language: "en",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    )).rejects.toThrow(AIAuthError);
  });

  it("throws AIError when edge function returns error", async () => {
    setMockInvokeResponse(null, { message: "Edge Function returned a non-2xx status code" });

    await expect(generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "custom",
        role: "intro",
        length: "standard",
        audience: "intermediate",
        tone: "formal",
        language: "en",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    )).rejects.toThrow(AIError);
  });

  it("throws AIRateLimitError when edge function returns rate limit response", async () => {
    setMockInvokeResponse({ error: "Daily request limit exceeded", limit: 100, current: 100 });

    await expect(generateCase(
      {
        motion: "Test motion",
        side: "pro",
        format: "custom",
        role: "intro",
        length: "standard",
        audience: "intermediate",
        tone: "formal",
        language: "en",
      },
      { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7 }
    )).rejects.toThrow(AIRateLimitError);
  });
});

