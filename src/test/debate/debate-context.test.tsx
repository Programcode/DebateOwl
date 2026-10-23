import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { useDebateStore } from '@/lib/stores/debate-store';
import { useSessionStore, type SavedItem, type Source } from '@/lib/stores/session-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
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

  it('lists every result in the debate for the pin limit, including the chat open in Ask', () => {
    const plan = planDebateContext('ask', 'both', TEST_DEBATE_ID, inputs({
      pins: [{ kind: 'case', id: uuid(10) }, { kind: 'chat', id: uuid(20) }, { kind: 'case', id: uuid(40) }],
      excludeChatId: uuid(20),
    }));
    expect(plan.resultKeys.has(`case:${uuid(10)}`)).toBe(true);
    expect(plan.resultKeys.has(`chat:${uuid(20)}`)).toBe(true);
    expect(plan.resultKeys.has(`case:${uuid(40)}`)).toBe(false);
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
      serverHydration: 'complete',
    });
    useSparringStore.setState({ hydrated: true, historyComplete: true });
  });
  afterEach(() => {
    resetDebates();
    useSessionStore.setState({ sourceLibrary: [], savedCases: [] });
  });

  const brainstormInput = { motion: 'This House would make public transport free', side: 'pro' as const, outputMode: 'topfive' as const, language: 'en' };
  const config = { provider: 'openrouter' as const, model: 'openai/gpt-6-luna' };
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

  it('reloads the debate list when the debate was deleted on another device', async () => {
    seedCurrentDebate();
    const hydrate = vi.fn(async () => undefined);
    const original = useDebateStore.getState().hydrate;
    useDebateStore.setState({ hydrate });
    try {
      setMockInvokeResponse(null, { message: 'Debate not found', context: { status: 404 } });
      await expect(brainstorm(brainstormInput, config)).rejects.toThrow();
      expect(hydrate).toHaveBeenCalledTimes(1);
    } finally {
      useDebateStore.setState({ hydrate: original });
    }
  });

  it('sends no debate material in one-off mode and says so above the button', async () => {
    enableOneOffMode();
    setMockInvokeResponse({ output: { needsMoreInfo: false, clarifyingQuestions: [], topFive: [], nextSteps: [], warningsAndTradeoffs: [] } });
    await brainstorm(brainstormInput, config);
    expect(lastBody().debateContext).toBeUndefined();
    expect(lastBody().sourceIds).toEqual([]);

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

  it('counts only what reaches the model and says how much did not fit', () => {
    seedCurrentDebate();
    useSessionStore.setState({ sourceLibrary: Array.from({ length: 12 }, (_, i) => source(i + 1)), savedCases: [] });
    render(<DebateContextControl feature="generate" side="pro" />);
    const control = screen.getByTestId('debate-context-control');
    expect(control).toHaveTextContent('Using 10 of 12 sources (2 didn’t fit)');
  });

  it('keeps pin buttons disabled until saved results have loaded', async () => {
    // Pins on results that have not loaded yet cannot be counted toward the limit.
    seedCurrentDebate();
    useSessionStore.setState({ serverHydration: 'pending' });
    useSparringStore.setState({ hydrated: false, historyComplete: false });
    render(<DebateContextControl feature="generate" side="pro" />);
    fireEvent.click(within(screen.getByTestId('debate-context-control')).getByRole('button', { name: 'Review' }));
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(useDebateContextStore.getState().pinsLoaded[TEST_DEBATE_ID]).toBe(true));
    const pin = within(sheet).getByRole('button', { name: /Pin Result 10/ });

    expect(pin).toBeDisabled();
    act(() => useSessionStore.setState({ serverHydration: 'complete' }));
    expect(pin).toBeDisabled();
    act(() => useSparringStore.setState({ hydrated: true, historyComplete: true }));
    expect(pin).toBeEnabled();
  });

  it.each([
    ['a saved-result query', () => useSessionStore.setState({ serverHydration: 'partial' })],
    ['the sparring history query', () => useSparringStore.setState({ historyComplete: false })],
  ])('counts every pin toward the limit when %s failed', async (_name, failHydration) => {
    // A result missing because its list failed to load may still exist.
    seedCurrentDebate();
    failHydration();
    render(<DebateContextControl feature="generate" side="pro" />);
    fireEvent.click(within(screen.getByTestId('debate-context-control')).getByRole('button', { name: 'Review' }));
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(useDebateContextStore.getState().pinsLoaded[TEST_DEBATE_ID]).toBe(true));
    const unlisted = [40, 41, 42].map((n) => ({ kind: 'case' as const, id: uuid(n) }));
    act(() => useDebateContextStore.setState((state) => ({ pins: { ...state.pins, [TEST_DEBATE_ID]: unlisted } })));

    const pin = within(sheet).getByRole('button', { name: /Pin Result 10/ });
    expect(pin).toBeEnabled();
    fireEvent.click(pin);
    await new Promise((done) => setTimeout(done, 0));

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual(unlisted);
  });
});

describe('Pinned results', () => {
  const caseRef = { kind: 'case' as const, id: uuid(10) };
  const attackRef = { kind: 'attack' as const, id: uuid(11) };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }

  beforeEach(() => {
    resetMockState();
    useDebateContextStore.getState().resetLocalData();
  });

  it('keeps an unpin made while an older pin load was still in flight', async () => {
    const load = deferred<{ data: unknown; error: null }>();
    supabaseMock.from.mockImplementationOnce((() => ({ select: () => ({ eq: () => load.promise }) })) as never);
    useDebateContextStore.setState({ pins: { [TEST_DEBATE_ID]: [caseRef] } });

    const loading = useDebateContextStore.getState().loadPins(TEST_DEBATE_ID);
    await useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    load.resolve({ data: [{ item_kind: 'case', item_id: caseRef.id }], error: null });
    await loading;

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([]);
    expect(useDebateContextStore.getState().pinsLoaded[TEST_DEBATE_ID]).toBe(true);
  });

  it('undoes only its own change when a pin fails to save', async () => {
    const insert = deferred<{ error: { message: string } }>();
    supabaseMock.from.mockImplementationOnce((() => ({ insert: () => insert.promise })) as never);
    useDebateContextStore.setState({ pins: { [TEST_DEBATE_ID]: [caseRef] } });

    const pinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, attackRef);
    const unpinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    insert.resolve({ error: { message: 'offline' } });
    await expect(pinning).rejects.toThrow('offline');
    await unpinning;

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([]);
  });

  it('keeps saved pins when the student pins before the first load returns', async () => {
    const load = deferred<{ data: unknown; error: null }>();
    supabaseMock.from.mockImplementationOnce((() => ({ select: () => ({ eq: () => load.promise }) })) as never);

    const loading = useDebateContextStore.getState().loadPins(TEST_DEBATE_ID);
    await useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, attackRef);
    load.resolve({ data: [{ item_kind: 'case', item_id: caseRef.id }], error: null });
    await loading;

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([caseRef, attackRef]);
  });

  it('keeps a pin that finished saving while an older load was in flight', async () => {
    const insert = deferred<{ error: null }>();
    const load = deferred<{ data: unknown; error: null }>();
    supabaseMock.from
      .mockImplementationOnce((() => ({ insert: () => insert.promise })) as never)
      .mockImplementationOnce((() => ({ select: () => ({ eq: () => load.promise }) })) as never);

    const pinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    await new Promise((done) => setTimeout(done, 0));
    // The load reads the table before the insert commits, then answers after it.
    const loading = useDebateContextStore.getState().loadPins(TEST_DEBATE_ID);
    insert.resolve({ error: null });
    await pinning;
    load.resolve({ data: [], error: null });
    await loading;

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([caseRef]);
  });

  it('saves a quick pin and unpin of the same result in the order they were made', async () => {
    const insert = deferred<{ error: null }>();
    const calls: string[] = [];
    const deleted = { eq: () => deleted, then: (done: (value: { error: null }) => void) => { calls.push('delete'); done({ error: null }); } };
    supabaseMock.from
      .mockImplementationOnce((() => ({ insert: () => { calls.push('insert'); return insert.promise; } })) as never)
      .mockImplementationOnce((() => ({ delete: () => deleted })) as never);

    const pinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    const unpinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    await new Promise((done) => setTimeout(done, 0));
    expect(calls).toEqual(['insert']);
    insert.resolve({ error: null });
    await Promise.all([pinning, unpinning]);

    expect(calls).toEqual(['insert', 'delete']);
    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([]);
  });

  it('does not count pins on deleted results toward the limit', async () => {
    const live = [12, 14].map((n) => ({ kind: 'case' as const, id: uuid(n) }));
    const existing = new Set([...live, caseRef, attackRef].map((ref) => `${ref.kind}:${ref.id}`));
    useDebateContextStore.setState({ pins: { [TEST_DEBATE_ID]: [{ kind: 'case', id: uuid(40) }, ...live] } });

    // Two quick clicks share one rendered plan; the second must see the first.
    const first = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, attackRef, existing);
    const second = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef, existing);
    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow('pin_limit');
  });

  it('keeps a later pin when an earlier save of the same result fails', async () => {
    const firstInsert = deferred<{ error: { message: string } }>();
    const calls: string[] = [];
    const deleted = { eq: () => deleted, then: (done: (value: { error: null }) => void) => { calls.push('delete'); done({ error: null }); } };
    supabaseMock.from
      .mockImplementationOnce((() => ({ insert: () => { calls.push('insert'); return firstInsert.promise; } })) as never)
      .mockImplementationOnce((() => ({ delete: () => deleted })) as never)
      .mockImplementationOnce((() => ({ insert: () => { calls.push('insert'); return Promise.resolve({ error: null }); } })) as never);

    // Pin, unpin and pin again while the first save is still pending.
    const toggles = [0, 1, 2].map(() => useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef));
    firstInsert.resolve({ error: { message: 'offline' } });
    await Promise.all(toggles);

    expect(calls).toEqual(['insert', 'delete', 'insert']);
    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([caseRef]);
  });

  it('ends unpinned when a quick pin and unpin both fail to save', async () => {
    const deleted = { eq: () => deleted, then: (done: (value: { error: { message: string } }) => void) => done({ error: { message: 'offline' } }) };
    supabaseMock.from
      .mockImplementationOnce((() => ({ insert: () => Promise.resolve({ error: { message: 'offline' } }) })) as never)
      .mockImplementationOnce((() => ({ delete: () => deleted })) as never);

    const pinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    const unpinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    await Promise.allSettled([pinning, unpinning]);

    // Neither save reached the database, so the result was never pinned.
    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([]);
  });

  it('treats pinning a result that is already saved as pinned', async () => {
    const deleted = { eq: () => deleted, then: (done: (value: { error: { message: string } }) => void) => done({ error: { message: 'offline' } }) };
    supabaseMock.from
      .mockImplementationOnce((() => ({ delete: () => deleted })) as never)
      .mockImplementationOnce((() => ({ insert: () => Promise.resolve({ error: { code: '23505', message: 'duplicate key' } }) })) as never);
    useDebateContextStore.setState({ pins: { [TEST_DEBATE_ID]: [caseRef] } });

    // The unpin fails, so the row stays; pinning again must not unpin locally.
    const unpinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    const pinning = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    await Promise.all([unpinning, pinning]);

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([caseRef]);
  });

  it('drops pin writes left over from before a sign-out', async () => {
    const oldInsert = deferred<{ error: { message: string } }>();
    const calls: string[] = [];
    supabaseMock.from
      .mockImplementationOnce((() => ({ insert: () => { calls.push('old'); return oldInsert.promise; } })) as never)
      .mockImplementationOnce((() => ({ insert: () => { calls.push('new'); return Promise.resolve({ error: null }); } })) as never);

    const oldPin = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    const oldQueued = useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, attackRef);
    await new Promise((done) => setTimeout(done, 0));
    useDebateContextStore.getState().resetLocalData();

    // The next account's change must not wait behind the old one.
    await useDebateContextStore.getState().togglePin(TEST_DEBATE_ID, caseRef);
    expect(calls).toEqual(['old', 'new']);

    // The old failure must not undo the new account's pin, and the queued old
    // write must never run under the new account.
    oldInsert.resolve({ error: { message: 'offline' } });
    await expect(oldPin).resolves.toBeUndefined();
    await expect(oldQueued).resolves.toBeUndefined();
    expect(calls).toEqual(['old', 'new']);
    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toEqual([caseRef]);
  });

  it('ignores a pin load that returns after a sign-out', async () => {
    const load = deferred<{ data: unknown; error: null }>();
    supabaseMock.from.mockImplementationOnce((() => ({ select: () => ({ eq: () => load.promise }) })) as never);

    const loading = useDebateContextStore.getState().loadPins(TEST_DEBATE_ID);
    useDebateContextStore.getState().resetLocalData();
    load.resolve({ data: [{ item_kind: 'case', item_id: caseRef.id }], error: null });
    await loading;

    expect(useDebateContextStore.getState().pins[TEST_DEBATE_ID]).toBeUndefined();
    expect(useDebateContextStore.getState().pinsLoaded[TEST_DEBATE_ID]).toBeUndefined();
  });
});
