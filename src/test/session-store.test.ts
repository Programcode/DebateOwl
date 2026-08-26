import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMockState,
  setMockAuthUser,
  setMockTableResponse,
  supabaseMock,
} from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/client", () => ({ supabase: supabaseMock }));

import { useSessionStore } from "@/lib/stores/session-store";

import type { GenerateOutput } from "@/lib/ai/schemas/generate";
import type { AttackOutput } from "@/lib/ai/schemas/attack";

const sampleGenerate: GenerateOutput = {
  caseStructure: {
    thesis: "Test thesis",
    framework: "Test framework",
    keyDefinitions: ["A"],
    burdenOfProof: "Test burden",
  },
  contentions: [],
  predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
  counters: [],
  metadata: { side: "pro", format: "Test", generatedAt: new Date().toISOString() },
};

const sampleAttack: AttackOutput = {
  overallAssessment: { score: 50, summary: "ok", strengthAreas: [] },
  weaknesses: [],
  fallaciesDetected: [],
  crossExQuestions: [],
  weighingAnalysis: { currentWeighing: "none", missingComparisons: [], improvementSuggestions: [] },
};

describe("session-store", () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    useSessionStore.setState({
      generateResult: null,
      generateLoading: false,
      attackResult: null,
      attackLoading: false,
      brainstormResult: null,
      brainstormLoading: false,
      factoidsResult: null,
      factoidsLoading: false,
      askMessages: [],
      askLoading: false,
      savedCases: [],
      savedAttacks: [],
      savedBrainstorms: [],
      savedFactoids: [],
      savedChats: [],
      sourceLibrary: [],
    });
  });

  it("adds ask messages with id and timestamp", () => {
    const store = useSessionStore.getState();
    store.addAskMessage({ role: "user", content: "Hello" });
    const messages = useSessionStore.getState().askMessages;
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBeTruthy();
    expect(messages[0].timestamp).toBeGreaterThan(0);
  });

  it("saves and loads a case with server id replacement", async () => {
    setMockTableResponse("cases", {
      insert: {
        id: "case_1",
        title: "My Case",
        output: sampleGenerate,
        created_at: new Date().toISOString(),
      },
    });

    useSessionStore.getState().setGenerateResult(sampleGenerate);
    await useSessionStore.getState().saveCurrentCase("My Case");

    const saved = useSessionStore.getState().savedCases;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("case_1");

    useSessionStore.getState().setGenerateResult(null);
    useSessionStore.getState().loadSavedCase("case_1");
    expect(useSessionStore.getState().generateResult?.caseStructure.thesis).toBe("Test thesis");
  });

  it("saves and loads an attack result", async () => {
    setMockTableResponse("attacks", {
      insert: {
        id: "attack_1",
        title: "Attack",
        output: sampleAttack,
        created_at: new Date().toISOString(),
      },
    });

    useSessionStore.getState().setAttackResult(sampleAttack);
    await useSessionStore.getState().saveCurrentAttack("Attack");

    const saved = useSessionStore.getState().savedAttacks;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("attack_1");

    useSessionStore.getState().setAttackResult(null);
    useSessionStore.getState().loadSavedAttack("attack_1");
    expect(useSessionStore.getState().attackResult?.overallAssessment.score).toBe(50);
  });

  it("adds sources and toggles active state", async () => {
    setMockTableResponse("sources", {
      insert: {
        id: "source_1",
        title: "Doc",
        content: "Test",
        type: "text",
        origin: null,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      update: { is_active: false },
    });

    await useSessionStore.getState().addSource({ title: "Doc", content: "Test", type: "text" });
    let sources = useSessionStore.getState().sourceLibrary;
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe("source_1");
    expect(sources[0].isActive).toBe(true);

    await useSessionStore.getState().toggleSource("source_1");
    sources = useSessionStore.getState().sourceLibrary;
    expect(sources[0].isActive).toBe(false);
  });

  it("inserts an explicitly inactive source as inactive", async () => {
    setMockTableResponse("sources", {
      insert: {
        id: "source_inactive",
        title: "Inactive source",
        content: "Test",
        type: "text",
        origin: null,
        is_active: false,
        created_at: new Date().toISOString(),
      },
    });
    const insertCalls: Array<Record<string, unknown>> = [];
    const originalFrom = supabaseMock.from.getMockImplementation() as unknown as (table: string) => ReturnType<typeof supabaseMock.from>;
    supabaseMock.from.mockImplementation(((table: string) => {
      const builder = originalFrom(table);
      if (table === "sources") {
        const originalInsert = builder.insert;
        builder.insert = ((payload: Record<string, unknown>) => {
          insertCalls.push(payload);
          return (originalInsert as unknown as (p: Record<string, unknown>) => ReturnType<typeof builder.insert>)(payload);
        }) as typeof builder.insert;
      }
      return builder;
    }) as never);

    try {
      await useSessionStore.getState().addSource({
        title: "Inactive source",
        content: "Test",
        type: "text",
        isActive: false,
      });
    } finally {
      supabaseMock.from.mockImplementation(originalFrom as never);
    }

    expect(insertCalls[0]).toEqual(expect.objectContaining({ is_active: false }));
    expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(false);
  });

  it("hydrates server data when available", async () => {
    setMockTableResponse("cases", {
      order: [{ id: "case_2", title: "Server Case", output: sampleGenerate, created_at: new Date().toISOString() }],
    });
    setMockTableResponse("attacks", { order: [] });
    setMockTableResponse("brainstorms", { order: [] });
    setMockTableResponse("factoids", { order: [] });
    setMockTableResponse("chats", { order: [] });
    setMockTableResponse("sources", { order: [] });

    await useSessionStore.getState().hydrateFromServer();
    expect(useSessionStore.getState().savedCases).toHaveLength(1);
    expect(useSessionStore.getState().savedCases[0].title).toBe("Server Case");
  });

  it("skips server writes when user is not signed in", async () => {
    setMockAuthUser(null);
    useSessionStore.getState().setGenerateResult(sampleGenerate);
    await useSessionStore.getState().saveCurrentCase("Local only");
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("clearSession resets transient results", () => {
    useSessionStore.getState().setGenerateResult(sampleGenerate);
    useSessionStore.getState().setAttackResult(sampleAttack);
    useSessionStore.getState().addAskMessage({ role: "user", content: "Hi" });

    useSessionStore.getState().clearSession();
    const state = useSessionStore.getState();
    expect(state.generateResult).toBeNull();
    expect(state.attackResult).toBeNull();
    expect(state.askMessages).toHaveLength(0);
  });

  it("keeps a source locally and rejects when its server deletion fails", async () => {
    useSessionStore.setState({
      sourceLibrary: [{
        id: "source_1",
        title: "Source",
        content: "Content",
        type: "text",
        createdAt: Date.now(),
        isActive: true,
      }],
    } as Partial<ReturnType<typeof useSessionStore.getState>>);
    supabaseMock.from.mockImplementationOnce((() => ({
      delete: () => ({ eq: async () => ({ data: null as null, error: { message: "delete failed" } }) }),
    })) as never);

    await expect(useSessionStore.getState().removeSource("source_1")).rejects.toThrow("delete failed");
    expect(useSessionStore.getState().sourceLibrary).toHaveLength(1);
  });

  it("sends provenance metadata when saving a discovered source", async () => {
    setMockAuthUser({ id: "user_1" });
    setMockTableResponse("sources", {
      insert: { id: "source_9", title: "Gov report", content: "c", type: "url", origin: "https://gov.example/data", folder: "Auto-saved", is_active: true, created_at: new Date().toISOString(), metadata: { qualityLabel: "strong" } },
    });
    const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const originalFrom = supabaseMock.from.getMockImplementation() as unknown as (table: string) => ReturnType<typeof supabaseMock.from>;
    supabaseMock.from.mockImplementation(((table: string) => {
      const builder = originalFrom(table);
      if (table === "sources") {
        const originalInsert = builder.insert;
        builder.insert = ((payload: Record<string, unknown>) => {
          insertCalls.push({ table, payload });
          return (originalInsert as unknown as (p: Record<string, unknown>) => ReturnType<typeof builder.insert>)(payload);
        }) as typeof builder.insert;
      }
      return builder;
    }) as never);

    try {
      await useSessionStore.getState().addSource({
        title: "Gov report",
        content: "c",
        type: "url",
        origin: "https://gov.example/data",
        folder: "Auto-saved",
        metadata: {
          url: "https://gov.example/data",
          sourceType: "government",
          qualityScore: 82,
          qualityLabel: "strong",
          query: "policy statistics 2026",
          capturedVia: "generate",
        },
      });
    } finally {
      supabaseMock.from.mockImplementation(originalFrom as never);
    }

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload.metadata).toEqual({
      url: "https://gov.example/data",
      sourceType: "government",
      qualityScore: 82,
      qualityLabel: "strong",
      query: "policy statistics 2026",
      capturedVia: "generate",
    });
  });

  it("round-trips provenance metadata from the database into state", async () => {
    setMockAuthUser({ id: "user_1" });
    const metadata = { url: "https://gov.example/data", qualityLabel: "moderate" as const, capturedVia: "brainstorm" };
    setMockTableResponse("sources", {
      insert: { id: "source_10", title: "News", content: "c", type: "url", origin: "https://news.example/a", folder: "Auto-saved", is_active: true, created_at: new Date().toISOString(), metadata },
    });

    await useSessionStore.getState().addSource({
      title: "News",
      content: "c",
      type: "url",
      origin: "https://news.example/a",
      folder: "Auto-saved",
      metadata,
    });

    const saved = useSessionStore.getState().sourceLibrary[0];
    expect(saved.metadata).toEqual(metadata);
  });

  it("hydrates valid provenance metadata from the database", async () => {
    setMockTableResponse("sources", {
      order: [{
        id: "source_11",
        title: "Policy source",
        content: "c",
        type: "url",
        origin: "https://example.com/policy",
        folder: "Auto-saved",
        is_active: true,
        created_at: new Date().toISOString(),
        metadata: {
          url: "https://example.com/policy",
          sourceType: "government",
          qualityScore: 91,
          qualityLabel: "strong",
          query: "policy update",
          capturedVia: "ask",
        },
      }],
    });

    await useSessionStore.getState().hydrateFromServer();

    expect(useSessionStore.getState().sourceLibrary[0].metadata).toEqual({
      url: "https://example.com/policy",
      sourceType: "government",
      qualityScore: 91,
      qualityLabel: "strong",
      query: "policy update",
      capturedVia: "ask",
    });
  });

  it("drops malformed provenance fields while hydrating valid fields", async () => {
    setMockTableResponse("sources", {
      order: [{
        id: "source_12",
        title: "Mixed source",
        content: "c",
        type: "url",
        origin: "https://example.com/mixed",
        is_active: true,
        created_at: new Date().toISOString(),
        metadata: {
          url: "https://example.com/mixed",
          sourceType: 42,
          qualityScore: "91",
          qualityLabel: "invalid",
          query: "valid query",
          capturedVia: null,
        },
      }],
    });

    await useSessionStore.getState().hydrateFromServer();

    expect(useSessionStore.getState().sourceLibrary[0].metadata).toEqual({
      url: "https://example.com/mixed",
      query: "valid query",
    });
  });

  it("persists local collections but excludes pending session state", () => {
    const partialize = useSessionStore.persist.getOptions().partialize!;
    const savedCases = [{ id: "case_1", title: "Case", createdAt: Date.now(), data: sampleGenerate }];
    const sourceLibrary = [{
      id: "source_1",
      title: "Source",
      content: "Content",
      type: "text" as const,
      createdAt: Date.now(),
      isActive: true,
    }];
    const persisted = partialize({
      ...useSessionStore.getState(),
      savedCases,
      sourceLibrary,
      pendingFlowchartData: { nodes: [], edges: [] },
    }) as Partial<ReturnType<typeof useSessionStore.getState>>;

    expect(persisted.savedCases).toEqual(savedCases);
    expect(persisted.sourceLibrary).toEqual(sourceLibrary);
    expect(persisted).not.toHaveProperty("pendingFlowchartData");
  });

  it("keeps local data when atomic server erasure is rejected", async () => {
    useSessionStore.setState({
      savedCases: [{ id: "1", title: "Case", createdAt: Date.now(), data: sampleGenerate }],
      savedAttacks: [{ id: "2", title: "Attack", createdAt: Date.now(), data: sampleAttack }],
    } as Partial<ReturnType<typeof useSessionStore.getState>>);
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "erase failed" },
    });

    await expect(useSessionStore.getState().clearAllData()).rejects.toThrow("erase failed");

    const state = useSessionStore.getState();
    expect(state.savedCases).toHaveLength(1);
    expect(state.savedAttacks).toHaveLength(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("clear_current_user_data");
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
