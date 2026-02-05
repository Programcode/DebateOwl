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

  it("clearAllData clears saved items locally", async () => {
    useSessionStore.setState({
      savedCases: [{ id: "1", title: "Case", createdAt: Date.now(), data: sampleGenerate }],
      savedAttacks: [{ id: "2", title: "Attack", createdAt: Date.now(), data: sampleAttack }],
    } as Partial<ReturnType<typeof useSessionStore.getState>>);

    await useSessionStore.getState().clearAllData();
    const state = useSessionStore.getState();
    expect(state.savedCases).toHaveLength(0);
    expect(state.savedAttacks).toHaveLength(0);
  });
});
