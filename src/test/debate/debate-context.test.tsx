import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { resetMockState, setMockInvokeResponse, setMockSessionToken, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', async () => {
  const { supabaseMock: mock } = await import('@/test/mocks/supabase');
  return {
    getActiveAccessToken: (): string | null => null,
    getActiveUserId: (): string | null => null,
    invokeAuthenticatedFunction: mock.functions.invoke,
    supabase: mock,
  };
});

import i18n from '@/i18n';
import { planDebateContext, type DebateContextInputs } from '@/lib/debate/context';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { brainstorm } from '@/lib/ai/client';
import { useDebateContextStore } from '@/lib/stores/debate-context-store';
import { useSessionStore, type SavedItem, type Source } from '@/lib/stores/session-store';
import { enableOneOffMode, resetDebates, seedCurrentDebate, TEST_DEBATE_ID } from '@/test/helpers/debate';

const OTHER_DEBATE = '99999999-2222-4333-8444-555555555555';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function source(n: number, overrides: Partial<Source> = {}): Source {
  return { id: uuid(n), title: `Source ${n}`, content: `Evidence ${n}`, type: 'text', debateId: TEST_DEBATE_ID, createdAt: n, isActive: true, ...overrides };
}

function result<T>(n: number, data: T, overrides: Partial<SavedItem<T>> = {}): SavedItem<T> {
  return { id: uuid(n), title: `Result ${n}`, data, createdAt: n, debateId: TEST_DEBATE_ID, side: 'pro', ...overrides };
}

const caseData = { caseStructure: { thesis: 'Free transport cuts emissions' }, contentions: [{ claim: 'Cheaper travel', reasoning: 'Fares deter riders', impact: 'More riders' }] };

function inputs(overrides: Partial<DebateContextInputs> = {}): DebateContextInputs {
  return {
    sourceLibrary: [source(1), source(2, { isActive: false }), source(3, { debateId: OTHER_DEBATE })],
    results: {
      case: [result(10, caseData), result(11, caseData, { side: 'con' }), result(12, caseData, { debateId: OTHER_DEBATE })],
      chat: [result(20, [{ role: 'user', content: 'Question' }])],
    },
    sparringSessions: [],
    pins: [],
    ...overrides,
  };
}

describe('Current Debate context plan', () => {
  it('sends active sources and relevant same-side results from this debate only', () => {
    const plan = planDebateContext('generate', 'pro', TEST_DEBATE_ID, inputs());
    expect(plan.request.sourceIds).toEqual([uuid(1)]);
    expect(plan.request.outputs).toEqual([{ kind: 'case', id: uuid(10) }]);
    expect(plan.sources.map((item) => item.id)).not.toContain(uuid(3));
    expect(plan.outputs.map((item) => item.ref.id)).not.toContain(uuid(12));
  });

  it('applies Review choices and pins, and leaves inactive sources out by default', () => {
    const plan = planDebateContext('generate', 'pro', TEST_DEBATE_ID, inputs({
      pins: [{ kind: 'chat', id: uuid(20) }],
      override: { debateId: TEST_DEBATE_ID, sources: { [uuid(1)]: false, [uuid(2)]: true }, outputs: { [`case:${uuid(10)}`]: false } },
    }));
    expect(plan.request.sourceIds).toEqual([uuid(2)]);
    expect(plan.request.outputs).toEqual([{ kind: 'chat', id: uuid(20) }]);
  });

  it('ignores choices made for another debate', () => {
    const plan = planDebateContext('generate', 'pro', TEST_DEBATE_ID, inputs({
      override: { debateId: OTHER_DEBATE, sources: { [uuid(1)]: false }, outputs: {} },
    }));
    expect(plan.request.sourceIds).toEqual([uuid(1)]);
  });

  it('keeps live sparring transcript-only and respects Crossfire Source Library', () => {
    const sparring = planDebateContext('sparring', 'pro', TEST_DEBATE_ID, inputs());
    expect(sparring.request).toMatchObject({ sourceIds: [], outputs: [] });
    const crossfire = planDebateContext('crossfire', 'both', TEST_DEBATE_ID, inputs(), { includeSources: false });
    expect(crossfire.request.sourceIds).toEqual([]);
    expect(crossfire.policy.instructions).toBe(false);
  });

  it('marks results that will not fit instead of claiming they were used', () => {
    const big = { caseStructure: { thesis: 'x'.repeat(400) }, contentions: Array.from({ length: 4 }, () => ({ claim: 'c'.repeat(200), reasoning: 'r'.repeat(320), impact: 'i'.repeat(240) })) };
    const plan = planDebateContext('ask', 'both', TEST_DEBATE_ID, inputs({
      results: { case: Array.from({ length: 6 }, (_, n) => result(30 + n, big)) },
      pins: Array.from({ length: 3 }, (_, n) => ({ kind: 'case' as const, id: uuid(30 + n) })),
    }));
    const flagged = plan.outputs.filter((item) => item.omittedForSize);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((item) => item.included)).toBe(true);
  });

  it('skips the chat already open in Ask', () => {
    const plan = planDebateContext('ask', 'both', TEST_DEBATE_ID, inputs({ pins: [{ kind: 'chat', id: uuid(20) }], excludeChatId: uuid(20) }));
    expect(plan.outputs.map((item) => item.ref.id)).not.toContain(uuid(20));
  });
});

describe('Current Debate context in requests and the Review control', () => {
  beforeEach(async () => {
    resetMockState();
    setMockSessionToken('token');
    await i18n.changeLanguage('en');
    useDebateContextStore.getState().resetLocalData();
    useSessionStore.setState({
      sourceLibrary: [source(1), source(2, { isActive: false })],
      savedCases: [result(10, caseData) as SavedItem<never>],
      savedAttacks: [], savedBrainstorms: [], savedFactoids: [], savedChats: [], savedCrossfires: [],
    });
  });
  afterEach(() => {
    resetDebates();
    useSessionStore.setState({ sourceLibrary: [], savedCases: [] });
  });

  const brainstormInput = { motion: 'This House would make public transport free', side: 'pro' as const, outputMode: 'topfive' as const, language: 'en' };
  const config = { provider: 'openrouter' as const, model: 'openai/gpt-5.6-luna', temperature: 0.7 };
  const lastBody = () => (supabaseMock.functions.invoke.mock.calls.at(-1) as unknown as [string, { body: Record<string, unknown> }])[1].body;

  it('sends IDs only, and a Review choice lasts for exactly one successful request', async () => {
    seedCurrentDebate();
    setMockInvokeResponse({ output: { needsMoreInfo: false, clarifyingQuestions: [], topFive: [], nextSteps: [], warningsAndTradeoffs: [] } });
    useDebateContextStore.getState().setSourceChoice('brainstorm', TEST_DEBATE_ID, uuid(2), true);

    await brainstorm(brainstormInput, config);
    const first = lastBody();
    expect(first.debateContext).toEqual({
      debateId: TEST_DEBATE_ID,
      side: 'pro',
      sourceIds: [uuid(1), uuid(2)],
      outputs: [{ kind: 'case', id: uuid(10) }],
    });
    expect(JSON.stringify(first.debateContext)).not.toContain('Evidence');

    await brainstorm(brainstormInput, config);
    expect((lastBody().debateContext as { sourceIds: string[] }).sourceIds).toEqual([uuid(1)]);
  });

  it('keeps a Review choice when the request fails', async () => {
    seedCurrentDebate();
    setMockInvokeResponse(null, { message: 'boom', context: { status: 500 } });
    useDebateContextStore.getState().setSourceChoice('brainstorm', TEST_DEBATE_ID, uuid(1), false);
    await expect(brainstorm(brainstormInput, config)).rejects.toThrow();
    expect(useDebateContextStore.getState().overrides.brainstorm?.sources[uuid(1)]).toBe(false);
  });

  it('sends no debate material in one-off mode and says so above the button', () => {
    enableOneOffMode();
    render(<DebateContextControl feature="generate" side="pro" />);
    expect(screen.getByTestId('debate-context-control')).toHaveTextContent('One-off mode: no Current Debate material will be used or saved.');
  });

  it('summarizes the selection and lets the student change it in Review', async () => {
    seedCurrentDebate();
    render(<DebateContextControl feature="generate" side="pro" />);
    const control = screen.getByTestId('debate-context-control');
    expect(control).toHaveTextContent('Using 1 source and 1 saved result: Case (In favor)');

    fireEvent.click(within(control).getByRole('button', { name: 'Review' }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('What this request will use');
    fireEvent.click(within(sheet).getByRole('checkbox', { name: /Source 2/ }));
    await waitFor(() => expect(control).toHaveTextContent('Using 2 sources and 1 saved result'));
    expect(within(sheet).getByRole('button', { name: /Pin Result 10/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
