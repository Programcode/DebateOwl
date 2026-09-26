/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMockState,
  setMockAuthUser,
  setMockTableResponse,
  supabaseMock,
} from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/client", () => ({ supabase: supabaseMock }));

import { useSessionStore } from "@/lib/stores/session-store";
import { useDebateStore } from "@/lib/stores/debate-store";
import { resetDebates as resetDebatesForTest, seedCurrentDebate, TEST_DEBATE_ID } from "@/test/helpers/debate";
import i18n from "@/i18n";

import type { GenerateOutput } from "@/lib/ai/schemas/generate";
import type { AttackOutput } from "@/lib/ai/schemas/attack";
import type { BrainstormOutput } from "@/lib/ai/schemas/brainstorm";
import type { FactoidsOutput } from "@/lib/ai/schemas/factoids";

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

const nowIso = '2026-02-12T10:00:00.000Z';

const brainstormOutput: BrainstormOutput = {
  needsMoreInfo: false,
  clarifyingQuestions: [],
  nextSteps: ['step'],
  warningsAndTradeoffs: [],
};

const factoidsOutput: FactoidsOutput = {
  factoids: [],
  searchSuggestions: [],
  warnings: [],
  verificationStatus: 'complete' as const,
};

describe("session-store", () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    seedCurrentDebate();
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
      askChatId: null,
      askChatDebateId: null,
      askPersistedCount: 0,
      savedCases: [],
      savedAttacks: [],
      savedBrainstorms: [],
      savedFactoids: [],
      savedChats: [],
      savedFlowcharts: [],
      autosavedCases: [],
      autosavedAttacks: [],
      autosavedBrainstorms: [],
      autosavedFactoids: [],
      sourceFolders: ['General'],
      sourceLibrary: [],
      pendingFlowchartData: null,
      generateForm: {},
      attackForm: {},
      brainstormForm: {},
      factoidsForm: {},
    } as Partial<ReturnType<typeof useSessionStore.getState>>);
  });

  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    seedCurrentDebate();
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
      askChatId: null,
      askChatDebateId: null,
      askPersistedCount: 0,
      savedCases: [],
      savedAttacks: [],
      savedBrainstorms: [],
      savedFactoids: [],
      savedChats: [],
      sourceLibrary: [],
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
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

  const seedSources = (...sources: Array<{ id: string; folder: string; isActive?: boolean }>) => {
    useSessionStore.setState({
      sourceFolders: ['General', ...sources.map((s) => s.folder)],
      sourceLibrary: sources.map((s) => ({
        id: s.id,
        title: `Source ${s.id}`,
        content: 'Evidence',
        type: 'text' as const,
        folder: s.folder,
        isActive: s.isActive ?? true,
        debateId: TEST_DEBATE_ID,
        createdAt: Date.now(),
      })),
    } as Partial<ReturnType<typeof useSessionStore.getState>>);
  };

  it("merges nested form updates without dropping sibling fields", () => {
    const store = useSessionStore.getState();
    store.setGenerateForm({ options: { depth: "standard", citations: true } } as any);
    store.setGenerateForm({ options: { depth: "comprehensive" } } as any);
    store.setAttackForm({ caseText: "Attack case" });
    store.setBrainstormForm({ motion: "Brainstorm motion" });
    store.setFactoidsForm({ claim: "Factoid claim" });

    expect(useSessionStore.getState().generateForm).toEqual({
      options: { depth: "comprehensive", citations: true },
    });
    expect(useSessionStore.getState().attackForm).toEqual({ caseText: "Attack case" });
    expect(useSessionStore.getState().brainstormForm).toEqual({ motion: "Brainstorm motion" });
    expect(useSessionStore.getState().factoidsForm).toEqual({ claim: "Factoid claim" });
  });

  it("flips each feature's loading flag", () => {
    const store = useSessionStore.getState();
    store.setGenerateLoading(true);
    store.setAttackLoading(true);
    store.setBrainstormLoading(true);
    store.setFactoidsLoading(true);
    store.setAskLoading(true);

    const state = useSessionStore.getState();
    expect([
      state.generateLoading,
      state.attackLoading,
      state.brainstormLoading,
      state.factoidsLoading,
      state.askLoading,
    ]).toEqual([true, true, true, true, true]);
  });

  it("updates a source and syncs its new folder into the folder list", async () => {
    seedSources({ id: "src_1", folder: "General" });

    await useSessionStore.getState().updateSource("src_1", {
      title: "Updated source",
      content: "Updated content",
      folder: "Round 2",
      isActive: false,
    });

    const updated = useSessionStore.getState().sourceLibrary[0];
    expect(updated.title).toBe("Updated source");
    expect(updated.content).toBe("Updated content");
    expect(updated.folder).toBe("Round 2");
    expect(updated.isActive).toBe(false);
    expect(useSessionStore.getState().sourceFolders).toContain("Round 2");
  });

  it("renames a folder and moves its sources to General when it is deleted", async () => {
    seedSources({ id: "src_1", folder: "Round 1" });

    await useSessionStore.getState().renameSourceFolder("Round 1", "Finals");
    expect(useSessionStore.getState().sourceFolders).toContain("Finals");
    expect(useSessionStore.getState().sourceLibrary[0].folder).toBe("Finals");

    await useSessionStore.getState().deleteSourceFolder("Finals", "move-to-general");
    expect(useSessionStore.getState().sourceFolders).not.toContain("Finals");
    expect(useSessionStore.getState().sourceLibrary[0].folder).toBe("General");
  });

  it("sets active state for every source in a folder, and clearLibrary empties it", async () => {
    seedSources({ id: "src_1", folder: "Batch" }, { id: "src_2", folder: "Batch" });

    await useSessionStore.getState().setFolderActive("Batch", false);
    expect(useSessionStore.getState().sourceLibrary.every((source) => !source.isActive)).toBe(true);

    await useSessionStore.getState().removeSource("src_1");
    expect(useSessionStore.getState().sourceLibrary.map((source) => source.id)).toEqual(["src_2"]);

    await useSessionStore.getState().clearLibrary();
    expect(useSessionStore.getState().sourceLibrary).toHaveLength(0);
  });

  it('persists local collections but excludes transient loading and streaming state', () => {
    const source = {
      id: 'local-source',
      title: 'Local source',
      content: 'Guest and offline content must survive reloads.',
      type: 'text' as const,
      createdAt: Date.now(),
      isActive: true,
    };
    const state = {
      ...useSessionStore.getState(),
      generateLoading: true,
      sourceFolders: ['General', 'Offline folder'],
      sourceLibrary: [source],
      savedCases: [{ id: 'offline-case', title: 'Offline case', createdAt: Date.now(), data: { offline: true } as any }],
      autosavedCases: [{ id: 'autosave', title: 'Draft', createdAt: Date.now(), data: { draft: true } as any }],
      askStreamingAssistant: {
        id: 'streaming',
        role: 'assistant' as const,
        content: 'Partial response',
        timestamp: Date.now(),
        isStreaming: true as const,
      },
    };
    const partialize = useSessionStore.persist.getOptions().partialize;

    expect(partialize).toBeTypeOf('function');
    const persisted = partialize!(state) as Partial<typeof state>;

    expect(persisted.sourceLibrary).toEqual([source]);
    expect(persisted.sourceFolders).toEqual(['General', 'Offline folder']);
    expect(persisted.savedCases).toEqual(state.savedCases);
    expect(persisted.autosavedCases).toEqual(state.autosavedCases);
    expect(persisted).not.toHaveProperty('generateLoading');
    expect(persisted).not.toHaveProperty('askStreamingAssistant');
  });

  it('early-returns save helpers when there is no current result/message', async () => {
    await useSessionStore.getState().saveCurrentCase('no-case');
    await useSessionStore.getState().saveCurrentAttack('no-attack');
    await useSessionStore.getState().saveCurrentBrainstorm('no-brainstorm');
    await useSessionStore.getState().saveCurrentFactoids('no-factoids');
    await useSessionStore.getState().saveCurrentChat('no-chat');

    expect(useSessionStore.getState().savedCases).toHaveLength(0);
    expect(useSessionStore.getState().savedAttacks).toHaveLength(0);
    expect(useSessionStore.getState().savedBrainstorms).toHaveLength(0);
    expect(useSessionStore.getState().savedFactoids).toHaveLength(0);
    expect(useSessionStore.getState().savedChats).toHaveLength(0);
  });

  it('keeps only local saves when user is not authenticated', async () => {
    setMockAuthUser(null);

    useSessionStore.getState().setBrainstormResult(brainstormOutput as any);
    useSessionStore.getState().setFactoidsResult(factoidsOutput as any);
    useSessionStore.getState().addAskMessage({ role: 'user', content: 'Q' });

    await useSessionStore.getState().saveCurrentBrainstorm('Local brainstorm');
    await useSessionStore.getState().saveCurrentFactoids('Local factoids');
    await useSessionStore.getState().saveCurrentChat('Local chat');
    await useSessionStore.getState().saveFlowchart('Local flow', { nodes: [], edges: [] });

    expect(useSessionStore.getState().savedBrainstorms).toHaveLength(1);
    expect(useSessionStore.getState().savedFactoids).toHaveLength(1);
    expect(useSessionStore.getState().savedChats).toHaveLength(1);
    expect(useSessionStore.getState().savedFlowcharts).toHaveLength(1);
  });

  it('saves and loads brainstorm + factoids items with server id replacement', async () => {
    setMockTableResponse('brainstorms', {
      insert: {
        id: 'brain_1',
        title: 'Brainstorm 1',
        output: brainstormOutput,
        created_at: nowIso,
      },
    });
    setMockTableResponse('factoids', {
      insert: {
        id: 'fact_1',
        title: 'Factoids 1',
        output: factoidsOutput,
        created_at: nowIso,
      },
    });

    useSessionStore.getState().setBrainstormResult(brainstormOutput);
    useSessionStore.getState().setFactoidsResult(factoidsOutput);

    await useSessionStore.getState().saveCurrentBrainstorm('Brainstorm 1');
    await useSessionStore.getState().saveCurrentFactoids('Factoids 1');

    expect(useSessionStore.getState().savedBrainstorms[0].id).toBe('brain_1');
    expect(useSessionStore.getState().savedFactoids[0].id).toBe('fact_1');

    useSessionStore.getState().setBrainstormResult(null);
    useSessionStore.getState().setFactoidsResult(null);

    useSessionStore.getState().loadSavedBrainstorm('brain_1');
    useSessionStore.getState().loadSavedFactoids('fact_1');

    expect(useSessionStore.getState().brainstormResult?.nextSteps).toEqual(['step']);
    expect(useSessionStore.getState().factoidsResult?.verificationStatus).toBe('complete');
  });

  it('saves chats including message rows and restores chat history', async () => {
    setMockTableResponse('chats', {
      insert: {
        id: 'chat_1',
        title: 'Saved chat',
        created_at: nowIso,
      },
    });

    useSessionStore.getState().addAskMessage({ role: 'user', content: 'Question' });
    useSessionStore.getState().addAskMessage({ role: 'assistant', content: 'Answer' });

    await useSessionStore.getState().saveCurrentChat('Saved chat');

    expect(useSessionStore.getState().savedChats).toHaveLength(1);
    expect(useSessionStore.getState().savedChats[0].id).toBe('chat_1');
    expect(supabaseMock.from).toHaveBeenCalledWith('messages');

    useSessionStore.getState().clearAskMessages();
    useSessionStore.getState().loadSavedChat('chat_1');
    expect(useSessionStore.getState().askMessages).toHaveLength(2);
  });

  it('rejects server saves that return no record without adding local items', async () => {
    setMockTableResponse('brainstorms', { insert: null });
    setMockTableResponse('factoids', { insert: null });
    setMockTableResponse('chats', { insert: null });
    setMockTableResponse('flowcharts', { insert: null });

    useSessionStore.getState().setBrainstormResult(brainstormOutput as any);
    useSessionStore.getState().setFactoidsResult(factoidsOutput as any);
    useSessionStore.getState().addAskMessage({ role: 'user', content: 'Needs local id' });

    await expect(useSessionStore.getState().saveCurrentBrainstorm('Brain no server')).rejects.toThrow('No record returned');
    await expect(useSessionStore.getState().saveCurrentFactoids('Fact no server')).rejects.toThrow('No record returned');
    await expect(useSessionStore.getState().saveCurrentChat('Chat no server')).rejects.toThrow('No record returned');
    await expect(useSessionStore.getState().saveFlowchart('Flow no server', { nodes: [], edges: [] })).rejects.toThrow('No record returned');

    const state = useSessionStore.getState();
    expect(state.savedBrainstorms).toHaveLength(0);
    expect(state.savedFactoids).toHaveLength(0);
    expect(state.savedChats).toHaveLength(0);
    expect(state.savedFlowcharts).toHaveLength(0);
  });

  it('saves and deletes flowcharts', async () => {
    setMockTableResponse('flowcharts', {
      insert: {
        id: 'flow_1',
        title: 'Flowchart A',
        nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'A' }, type: 'default' }],
        edges: [],
        created_at: nowIso,
      },
    });

    await useSessionStore.getState().saveFlowchart('Flowchart A', {
      nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'A' }, type: 'default' }],
      edges: [],
    });

    expect(useSessionStore.getState().savedFlowcharts).toHaveLength(1);
    expect(useSessionStore.getState().savedFlowcharts[0].id).toBe('flow_1');

    await useSessionStore.getState().deleteSavedFlowchart('flow_1');
    expect(useSessionStore.getState().savedFlowcharts).toHaveLength(0);
  });

  it('hydrates server data across all supported entities', async () => {
    setMockTableResponse('cases', {
      order: [{ id: 'case_1', title: 'Case', output: { key: 'case' }, created_at: nowIso }],
    });
    setMockTableResponse('attacks', {
      order: [{ id: 'attack_1', title: 'Attack', output: { key: 'attack' }, created_at: nowIso }],
    });
    setMockTableResponse('brainstorms', {
      order: [{ id: 'brain_1', title: 'Brainstorm', output: brainstormOutput, created_at: nowIso }],
    });
    setMockTableResponse('factoids', {
      order: [{ id: 'fact_1', title: 'Factoids', output: factoidsOutput, created_at: nowIso }],
    });
    setMockTableResponse('chats', {
      order: [{ id: 'chat_1', title: 'Chat', created_at: nowIso }],
    });
    setMockTableResponse('messages', {
      in: [
        {
          id: 'msg_1',
          chat_id: 'chat_1',
          role: 'user',
          content: 'Hello',
          output: null,
          created_at: nowIso,
        },
      ],
    });
    setMockTableResponse('flowcharts', {
      order: [{ id: 'flow_1', title: 'Flow', nodes: [], edges: [], created_at: nowIso }],
    });
    setMockTableResponse('sources', {
      order: [
        {
          id: 'source_1',
          title: 'Source',
          content: 'Evidence',
          type: 'url',
          origin: 'https://example.com',
          is_active: true,
          created_at: nowIso,
        },
      ],
    });
    setMockTableResponse('source_folders', {
      order: [{ id: 'folder_1', name: 'Tournament', created_at: nowIso }],
    });

    await useSessionStore.getState().hydrateFromServer();

    const state = useSessionStore.getState();
    expect(state.savedCases).toHaveLength(1);
    expect(state.savedAttacks).toHaveLength(1);
    expect(state.savedBrainstorms).toHaveLength(1);
    expect(state.savedFactoids).toHaveLength(1);
    expect(state.savedChats[0].data).toHaveLength(1);
    expect(state.savedFlowcharts).toHaveLength(1);
    expect(state.sourceLibrary).toHaveLength(1);
    expect(state.sourceFolders).toContain('Tournament');
  });

  it('persists empty source folders for cross-device sync', async () => {
    await useSessionStore.getState().createSourceFolder('Round 1');

    expect(useSessionStore.getState().sourceFolders).toContain('Round 1');
    expect(supabaseMock.from).toHaveBeenCalledWith('source_folders');
  });

  it('replaces local saved work with the server so purged rows cannot reappear', async () => {
    useSessionStore.setState({
      savedCases: [{ id: 'local-case', title: 'Local', createdAt: Date.now(), data: { x: 1 } as any }],
    } as Partial<ReturnType<typeof useSessionStore.getState>>);

    setMockTableResponse('cases', { order: [] });
    setMockTableResponse('attacks', { order: [] });
    setMockTableResponse('brainstorms', { order: [] });
    setMockTableResponse('factoids', { order: [] });
    setMockTableResponse('chats', { order: [] });
    setMockTableResponse('flowcharts', { order: [] });
    setMockTableResponse('sources', { order: [] });
    setMockTableResponse('source_folders', { order: [] });

    await useSessionStore.getState().hydrateFromServer();

    expect(useSessionStore.getState().savedCases).toEqual([]);
  });

  it('hydrates safely when Supabase query responses contain null data arrays', async () => {
    const originalFrom = supabaseMock.from.getMockImplementation();
    supabaseMock.from.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(async () => ({ data: null, error: null })),
        in: vi.fn(() => ({
          order: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
      delete: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })), neq: vi.fn(async () => ({ data: null, error: null })) })),
      eq: vi.fn(async () => ({ data: null, error: null })),
      neq: vi.fn(async () => ({ data: null, error: null })),
      in: vi.fn(() => ({ order: vi.fn(async () => ({ data: null, error: null })) })),
      order: vi.fn(async () => ({ data: null, error: null })),
      table,
    }) as any);

    try {
      await useSessionStore.getState().hydrateFromServer();
      expect(useSessionStore.getState().savedCases).toHaveLength(0);
      expect(useSessionStore.getState().sourceLibrary).toHaveLength(0);
    } finally {
      if (originalFrom) supabaseMock.from.mockImplementation(originalFrom);
    }
  });

  it('clearAllData clears local state after successful atomic server erasure', async () => {
    useSessionStore.setState({
      savedCases: [{ id: 'case', title: 'c', createdAt: Date.now(), data: {} as any }],
      savedAttacks: [{ id: 'attack', title: 'a', createdAt: Date.now(), data: {} as any }],
      savedBrainstorms: [{ id: 'brain', title: 'b', createdAt: Date.now(), data: brainstormOutput as any }],
      savedFactoids: [{ id: 'fact', title: 'f', createdAt: Date.now(), data: factoidsOutput as any }],
      savedChats: [{ id: 'chat', title: 'chat', createdAt: Date.now(), data: [] as any }],
      savedFlowcharts: [{ id: 'flow', title: 'flow', createdAt: Date.now(), data: { nodes: [], edges: [] } as any }],
      autosavedCases: [{ id: 'autosave-case', title: 'draft', createdAt: Date.now(), data: {} as any }],
      autosavedAttacks: [{ id: 'autosave-attack', title: 'draft', createdAt: Date.now(), data: {} as any }],
      autosavedBrainstorms: [{ id: 'autosave-brainstorm', title: 'draft', createdAt: Date.now(), data: {} as any }],
      autosavedFactoids: [{ id: 'autosave-factoid', title: 'draft', createdAt: Date.now(), data: {} as any }],
      sourceLibrary: [{ id: 'src', title: 's', content: 'x', type: 'text', createdAt: Date.now(), isActive: true }],
    } as Partial<ReturnType<typeof useSessionStore.getState>>);

    await useSessionStore.getState().clearAllData();

    const state = useSessionStore.getState();
    expect(state.savedCases).toHaveLength(0);
    expect(state.savedAttacks).toHaveLength(0);
    expect(state.savedBrainstorms).toHaveLength(0);
    expect(state.savedFactoids).toHaveLength(0);
    expect(state.savedChats).toHaveLength(0);
    expect(state.savedFlowcharts).toHaveLength(0);
    expect(state.autosavedCases).toHaveLength(0);
    expect(state.autosavedAttacks).toHaveLength(0);
    expect(state.autosavedBrainstorms).toHaveLength(0);
    expect(state.autosavedFactoids).toHaveLength(0);
    expect(state.sourceLibrary).toHaveLength(0);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('clear_current_user_data');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('throws clearAllData safety error when user is missing', async () => {
    setMockAuthUser(null);
    await expect(useSessionStore.getState().clearAllData()).rejects.toThrow('Cannot delete data: No authenticated user');
  });

  it('resets local/transient state and form fields', () => {
    useSessionStore.setState({
      generateResult: { a: 1 } as any,
      attackResult: { b: 1 } as any,
      brainstormResult: brainstormOutput as any,
      factoidsResult: factoidsOutput as any,
      askMessages: [{ id: 'm1', role: 'user', content: 'q', timestamp: Date.now() }],
      sourceLibrary: [{ id: 'src', title: 's', content: 'x', type: 'text', createdAt: Date.now(), isActive: true }],
      pendingFlowchartData: { nodes: [], edges: [] },
      generateForm: { motion: 'M' } as any,
      attackForm: { caseText: 'C' } as any,
      brainstormForm: { motion: 'B' } as any,
      factoidsForm: { claim: 'F' } as any,
    } as Partial<ReturnType<typeof useSessionStore.getState>>);

    useSessionStore.getState().resetLocalData();

    expect(useSessionStore.getState().generateResult).toBeNull();
    expect(useSessionStore.getState().sourceLibrary).toHaveLength(0);

    useSessionStore.getState().clearSession();
    expect(useSessionStore.getState().pendingFlowchartData).toBeNull();
    expect(useSessionStore.getState().generateForm).toEqual({});
    expect(useSessionStore.getState().attackForm).toEqual({});
    expect(useSessionStore.getState().brainstormForm).toEqual({});
    expect(useSessionStore.getState().factoidsForm).toEqual({});
  });

  it('handles no-op source toggles and delete/load helpers', async () => {
    await useSessionStore.getState().toggleSource('missing');

    setMockTableResponse('cases', {
      insert: {
        id: 'case_del',
        title: 'Delete me',
        output: { key: 1 },
        created_at: nowIso,
      },
    });

    useSessionStore.getState().setGenerateResult({ key: 1 } as any);
    await useSessionStore.getState().saveCurrentCase('Delete me');
    expect(useSessionStore.getState().savedCases).toHaveLength(1);

    await useSessionStore.getState().deleteSavedCase('case_del');
    expect(useSessionStore.getState().savedCases).toHaveLength(0);

    // Load helpers should no-op when id does not exist
    useSessionStore.getState().loadSavedCase('missing');
    useSessionStore.getState().loadSavedAttack('missing');
    useSessionStore.getState().loadSavedBrainstorm('missing');
    useSessionStore.getState().loadSavedFactoids('missing');
    useSessionStore.getState().loadSavedChat('missing');
  });

  it("localizes automatic Brainstorm and Factoids titles", async () => {
    const brainstorm: BrainstormOutput = {
      needsMoreInfo: false,
      buckets: [],
      nextSteps: [],
      warningsAndTradeoffs: [],
    };
    const factoids: FactoidsOutput = {
      factoids: [],
      searchSuggestions: [],
      warnings: [],
      verificationStatus: 'complete',
    };

    await i18n.changeLanguage('hu');
    useSessionStore.getState().setBrainstormResult(brainstorm);
    useSessionStore.getState().setFactoidsResult(factoids);

    expect(useSessionStore.getState().autosavedBrainstorms[0].title).toBe('Ötletelés');
    expect(useSessionStore.getState().autosavedFactoids[0].title).toBe('Tények');
  });

  it("parses valid semantic metadata and discards only an invalid semantic object", async () => {
    setMockTableResponse("sources", {
      order: [
        {
          id: "semantic-valid", title: "Valid", content: "c", type: "url", origin: "https://example.com/valid", is_active: true, created_at: new Date().toISOString(),
          metadata: { qualityLabel: "strong", semantic: { relevance: 0.9, importance: 3, strength: 2, evaluatedAt: "2026-09-21T00:00:00.000Z", useCount: 4, caseUseCount: 2, lastUsedInCase: true } },
        },
        {
          id: "semantic-invalid", title: "Invalid", content: "c", type: "url", origin: "https://example.com/invalid", is_active: true, created_at: new Date().toISOString(),
          metadata: { qualityLabel: "moderate", semantic: { relevance: 7, importance: 5 } },
        },
      ],
    });

    await useSessionStore.getState().hydrateFromServer();
    expect(useSessionStore.getState().sourceLibrary.find((source) => source.id === "semantic-valid")?.metadata?.semantic?.caseUseCount).toBe(2);
    expect(useSessionStore.getState().sourceLibrary.find((source) => source.id === "semantic-invalid")?.metadata).toEqual({ qualityLabel: "moderate" });
  });

  it("persists metadata when updating a source", async () => {
    setMockAuthUser({ id: "user_1" });
    useSessionStore.setState({ sourceLibrary: [{ id: "source_1", title: "Source", content: "Content", type: "text", createdAt: 1, isActive: true }] });
    const updates: Array<Record<string, unknown>> = [];
    const originalFrom = supabaseMock.from.getMockImplementation() as unknown as (table: string) => ReturnType<typeof supabaseMock.from>;
    supabaseMock.from.mockImplementation(((table: string) => {
      const builder = originalFrom(table);
      if (table === "sources") {
        const originalUpdate = builder.update;
        builder.update = ((payload: Record<string, unknown>) => {
          updates.push(payload);
          return (originalUpdate as unknown as (p: Record<string, unknown>) => ReturnType<typeof builder.update>)(payload);
        }) as typeof builder.update;
      }
      return builder;
    }) as never);
    const semantic = { relevance: 0.8, importance: 2 as const, strength: 3 as const, evaluatedAt: "2026-09-21T00:00:00.000Z", useCount: 1, caseUseCount: 1, lastUsedInCase: true };
    try {
      await useSessionStore.getState().updateSource("source_1", { metadata: { semantic } });
    } finally {
      supabaseMock.from.mockImplementation(originalFrom as never);
    }
    expect(updates[0].metadata).toEqual({ semantic });
  });

  it("merges semantic assessments without losing source provenance", async () => {
    useSessionStore.setState({ sourceLibrary: [{
      id: "source_1",
      title: "Source",
      content: "Content",
      type: "url",
      origin: "https://example.com/source",
      createdAt: 1,
      isActive: true,
      debateId: TEST_DEBATE_ID,
      metadata: { url: "https://example.com/source", query: "original query", qualityLabel: "strong" },
    }] });

    await useSessionStore.getState().applySourceAssessments([{
      key: "source_1",
      id: "source_1",
      relevance: 0.9,
      importance: 3,
      strength: 2,
      evaluatedAt: "2026-09-21T00:00:00.000Z",
      retained: true,
      usedInCase: true,
    }]);

    expect(useSessionStore.getState().sourceLibrary[0].metadata).toEqual(expect.objectContaining({
      url: "https://example.com/source",
      query: "original query",
      qualityLabel: "strong",
      semantic: expect.objectContaining({ useCount: 1, caseUseCount: 1, lastUsedInCase: true }),
    }));
  });

  describe('Current Debate attachment', () => {
    it('records a result into the debate with its side and newest first', async () => {
      setMockTableResponse('cases', {
        insert: { id: 'case-1', title: 'Motion', output: sampleGenerate, created_at: nowIso, debate_id: TEST_DEBATE_ID, side: 'pro' },
      });
      const id = await useSessionStore.getState().recordResult('case', {
        title: 'Motion', input: { motion: 'Motion' }, output: sampleGenerate, debateId: TEST_DEBATE_ID, side: 'pro',
      });
      expect(id).toBe('case-1');
      const insert = supabaseMock.from.mock.results.find((result) => result.value.insert.mock.calls.length > 0)!.value.insert;
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user_1', debate_id: TEST_DEBATE_ID, side: 'pro', title: 'Motion' }));
      expect(useSessionStore.getState().savedCases[0]).toEqual(expect.objectContaining({ id: 'case-1', debateId: TEST_DEBATE_ID, side: 'pro' }));
    });

    it('attaches one-off work only through the ownership-checked RPC', async () => {
      useSessionStore.setState({ savedAttacks: [{ id: 'a1', title: 'One-off', createdAt: 1, data: sampleAttack, debateId: null }] });
      await useSessionStore.getState().attachItem('attack', 'a1', TEST_DEBATE_ID, 'con');
      expect(supabaseMock.rpc).toHaveBeenCalledWith('attach_to_debate', { p_kind: 'attack', p_id: 'a1', p_debate_id: TEST_DEBATE_ID, p_side: 'con' });
      expect(useSessionStore.getState().savedAttacks[0]).toEqual(expect.objectContaining({ debateId: TEST_DEBATE_ID, side: 'con' }));
    });

    it('records an Ask conversation as one chat and appends later messages to it', async () => {
      setMockTableResponse('chats', { insert: { id: 'chat-1', title: 'Question', created_at: nowIso, debate_id: TEST_DEBATE_ID, side: 'neutral' } });
      const store = useSessionStore.getState();
      store.addAskMessage({ role: 'user', content: 'Question' });
      store.addAskMessage({ role: 'assistant', content: 'Answer' });
      await Promise.all([store.syncAskChat(TEST_DEBATE_ID), store.syncAskChat(TEST_DEBATE_ID)]);

      const chatInserts = supabaseMock.from.mock.calls.filter(([table]) => table === 'chats');
      expect(chatInserts).toHaveLength(1);
      expect(useSessionStore.getState().askChatId).toBe('chat-1');
      expect(useSessionStore.getState().askPersistedCount).toBe(2);

      useSessionStore.getState().addAskMessage({ role: 'user', content: 'Follow-up' });
      useSessionStore.getState().addAskMessage({ role: 'assistant', content: 'More' });
      await useSessionStore.getState().syncAskChat(TEST_DEBATE_ID);
      expect(supabaseMock.from.mock.calls.filter(([table]) => table === 'chats')).toHaveLength(1);
      const messageInserts = supabaseMock.from.mock.results
        .filter((_, index) => supabaseMock.from.mock.calls[index][0] === 'messages')
        .map((result) => result.value.insert.mock.calls[0][0]);
      expect(messageInserts.map((rows: Array<{ content: string }>) => rows.map((row) => row.content)))
        .toEqual([['Question', 'Answer'], ['Follow-up', 'More']]);
      expect(useSessionStore.getState().savedChats[0]).toEqual(expect.objectContaining({ id: 'chat-1', debateId: TEST_DEBATE_ID }));
    });

    it('continues a loaded unsorted chat in place instead of copying it into the debate', async () => {
      const earlier = [
        { id: 'm1', role: 'user' as const, content: 'Old question', timestamp: 1 },
        { id: 'm2', role: 'assistant' as const, content: 'Old answer', timestamp: 2 },
      ];
      useSessionStore.setState({ savedChats: [{ id: 'old-chat', title: 'Old', createdAt: 1, data: earlier, debateId: null }] });
      useSessionStore.getState().loadSavedChat('old-chat');
      useSessionStore.getState().addAskMessage({ role: 'user', content: 'New question' });
      useSessionStore.getState().addAskMessage({ role: 'assistant', content: 'New answer' });
      await useSessionStore.getState().syncAskChat(TEST_DEBATE_ID);

      expect(supabaseMock.from.mock.calls.filter(([table]) => table === 'chats')).toHaveLength(0);
      const messages = supabaseMock.from.mock.results.find((_, index) => supabaseMock.from.mock.calls[index][0] === 'messages')!.value.insert.mock.calls[0][0];
      expect(messages.map((row: { chat_id: string; content: string }) => [row.chat_id, row.content]))
        .toEqual([['old-chat', 'New question'], ['old-chat', 'New answer']]);
    });

    it('does not hand an in-flight chat to a conversation started after clearing', async () => {
      setMockTableResponse('chats', { insert: { id: 'chat-1', title: 'First', created_at: nowIso, debate_id: TEST_DEBATE_ID, side: 'neutral' } });
      useSessionStore.getState().addAskMessage({ role: 'user', content: 'First' });
      useSessionStore.getState().addAskMessage({ role: 'assistant', content: 'Reply' });
      let releaseUser!: () => void;
      supabaseMock.auth.getUser.mockImplementationOnce(() => new Promise((resolve) => {
        releaseUser = () => resolve({ data: { user: { id: 'user_1' } } } as never);
      }));
      const pending = useSessionStore.getState().syncAskChat(TEST_DEBATE_ID);
      await vi.waitFor(() => expect(releaseUser).toBeTypeOf('function'));
      // The save has captured the first conversation and is waiting on the server.
      useSessionStore.getState().clearAskMessages();
      useSessionStore.getState().addAskMessage({ role: 'user', content: 'Second' });
      releaseUser();
      await pending;

      expect(useSessionStore.getState().askChatId).toBeNull();
      expect(useSessionStore.getState().askPersistedCount).toBe(0);
      expect(useSessionStore.getState().savedChats[0]).toEqual(expect.objectContaining({ id: 'chat-1' }));
    });

    it('starts a fresh Ask conversation when the Current Debate changes', () => {
      useSessionStore.setState({
        askMessages: [{ id: 'm1', role: 'user', content: 'In A', timestamp: 1 }],
        askChatId: 'chat-a',
        askChatDebateId: TEST_DEBATE_ID,
        askPersistedCount: 1,
      });
      const other = { ...useDebateStore.getState().debates[0], id: 'debate-b', motion: 'Other motion' };
      useDebateStore.setState((state) => ({ debates: [...state.debates, other], currentDebateId: 'debate-b' }));

      expect(useSessionStore.getState()).toEqual(expect.objectContaining({ askMessages: [], askChatId: null, askChatDebateId: null, askPersistedCount: 0 }));
    });

    it('drops local work of a deleted debate and keeps unsorted work', () => {
      useSessionStore.setState({
        savedCases: [
          { id: 'in-debate', title: 'A', createdAt: 1, data: sampleGenerate, debateId: TEST_DEBATE_ID },
          { id: 'unsorted', title: 'B', createdAt: 1, data: sampleGenerate, debateId: null },
        ],
      });
      seedSources({ id: 'src_1', folder: 'General' });
      useDebateStore.setState({ debates: [], currentDebateId: null });

      expect(useSessionStore.getState().savedCases.map((item) => item.id)).toEqual(['unsorted']);
      expect(useSessionStore.getState().sourceLibrary).toEqual([]);
    });

    it('renames and deletes a folder only for the Current Debate', async () => {
      seedSources({ id: 'mine', folder: 'Auto-saved' });
      useSessionStore.setState((state) => ({
        sourceLibrary: [...state.sourceLibrary, { ...state.sourceLibrary[0], id: 'theirs', debateId: 'debate-b' }],
      }));

      await useSessionStore.getState().renameSourceFolder('Auto-saved', 'Research');
      const folderOf = (id: string) => useSessionStore.getState().sourceLibrary.find((source) => source.id === id)!.folder;
      expect([folderOf('mine'), folderOf('theirs')]).toEqual(['Research', 'Auto-saved']);
      expect(useSessionStore.getState().sourceFolders).toEqual(expect.arrayContaining(['Auto-saved', 'Research']));

      // Empty in this debate, even though another debate still uses the name.
      await useSessionStore.getState().renameSourceFolder('Research', 'Auto-saved');
      await expect(useSessionStore.getState().deleteSourceFolder('Research', 'empty-only')).resolves.toBeUndefined();
      expect(folderOf('theirs')).toBe('Auto-saved');
    });

    it('refuses to save a source without a debate', async () => {
      resetDebatesForTest();
      await expect(useSessionStore.getState().addSource({ title: 'Loose', content: 'x', type: 'text' }))
        .rejects.toThrow('Select or create a debate before adding sources');
    });

    it('drops server-backed lists persisted by older clients', () => {
      const migrate = useSessionStore.persist.getOptions().migrate!;
      const migrated = migrate({ savedCases: [{ id: 'old' }], sourceLibrary: [{ id: 'legacy' }], askMessages: [{ id: 'm' }], generateForm: { motion: 'kept' } }, 0) as Record<string, unknown>;
      expect(migrated).not.toHaveProperty('savedCases');
      expect(migrated).not.toHaveProperty('askMessages');
      expect(migrated).not.toHaveProperty('sourceLibrary');
      expect(migrated.generateForm).toEqual({ motion: 'kept' });
    });
  });
});
