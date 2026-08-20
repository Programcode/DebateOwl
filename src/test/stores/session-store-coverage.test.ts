/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetMockState,
  setMockAuthUser,
  setMockTableResponse,
  supabaseMock,
} from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({ supabase: supabaseMock }));

import { useSessionStore } from '@/lib/stores/session-store';
import type { BrainstormOutput } from '@/lib/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';

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

describe('session-store coverage paths', () => {
  beforeEach(() => {
    resetMockState();
    localStorage.clear();
    useSessionStore.setState({
      generateResult: null,
      attackResult: null,
      brainstormResult: null,
      factoidsResult: null,
      askMessages: [],
      savedCases: [],
      savedAttacks: [],
      savedBrainstorms: [],
      savedFactoids: [],
      savedChats: [],
      savedFlowcharts: [],
      sourceFolders: ['General'],
      sourceLibrary: [],
      pendingFlowchartData: null,
      generateForm: {},
      attackForm: {},
      brainstormForm: {},
      factoidsForm: {},
    } as Partial<ReturnType<typeof useSessionStore.getState>>);
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

  it('retains local ids when server insert returns no data', async () => {
    setMockTableResponse('brainstorms', { insert: null });
    setMockTableResponse('factoids', { insert: null });
    setMockTableResponse('chats', { insert: null });
    setMockTableResponse('flowcharts', { insert: null });

    useSessionStore.getState().setBrainstormResult(brainstormOutput as any);
    useSessionStore.getState().setFactoidsResult(factoidsOutput as any);
    useSessionStore.getState().addAskMessage({ role: 'user', content: 'Needs local id' });

    await useSessionStore.getState().saveCurrentBrainstorm('Brain no server');
    await useSessionStore.getState().saveCurrentFactoids('Fact no server');
    await useSessionStore.getState().saveCurrentChat('Chat no server');
    await useSessionStore.getState().saveFlowchart('Flow no server', { nodes: [], edges: [] });

    const state = useSessionStore.getState();
    expect(state.savedBrainstorms[0].id).not.toBe('brain_1');
    expect(state.savedFactoids[0].id).not.toBe('fact_1');
    expect(state.savedChats[0].id).not.toBe('chat_1');
    expect(state.savedFlowcharts[0].id).not.toBe('flow_1');
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

  it('does not overwrite local state when server has no persisted data', async () => {
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

    expect(useSessionStore.getState().savedCases[0].id).toBe('local-case');
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

    await useSessionStore.getState().hydrateFromServer();
    expect(useSessionStore.getState().savedCases).toHaveLength(0);
    expect(useSessionStore.getState().sourceLibrary).toHaveLength(0);

    if (originalFrom) supabaseMock.from.mockImplementation(originalFrom);
  });

  it('clearAllData deletes by user and clears local state', async () => {
    useSessionStore.setState({
      savedCases: [{ id: 'case', title: 'c', createdAt: Date.now(), data: {} as any }],
      savedAttacks: [{ id: 'attack', title: 'a', createdAt: Date.now(), data: {} as any }],
      savedBrainstorms: [{ id: 'brain', title: 'b', createdAt: Date.now(), data: brainstormOutput as any }],
      savedFactoids: [{ id: 'fact', title: 'f', createdAt: Date.now(), data: factoidsOutput as any }],
      savedChats: [{ id: 'chat', title: 'chat', createdAt: Date.now(), data: [] as any }],
      savedFlowcharts: [{ id: 'flow', title: 'flow', createdAt: Date.now(), data: { nodes: [], edges: [] } as any }],
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
    expect(state.sourceLibrary).toHaveLength(0);

    expect(supabaseMock.from).toHaveBeenCalledWith('messages');
    expect(supabaseMock.from).toHaveBeenCalledWith('api_keys');
    expect(supabaseMock.from).toHaveBeenCalledWith('user_settings');
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
});
