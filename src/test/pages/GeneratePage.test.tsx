
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GeneratePage from '@/pages/GeneratePage';
import { BrowserRouter } from 'react-router-dom';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), writable: true });

// Mock dependencies
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/lib/ai/client', () => ({
    generateCase: vi.fn(),
    askChat: vi.fn(),
    isAIAuthError: vi.fn(() => false),
    isAIRateLimitError: vi.fn(() => false),
    isTimeoutError: vi.fn(() => false),
}));

// Mock hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
    toast: (...args: unknown[]) => mockToast(...args),
}));

// Mock stores
const mockSetGenerateLoading = vi.fn();
const mockSetGenerateResult = vi.fn();
const mockSaveCurrentCase = vi.fn();
const mockRecordResult = vi.fn(async () => 'recorded-case');
const mockUpdateRecordedResult = vi.fn(async () => undefined);
const mockAddAskMessage = vi.fn();
const mockSetPendingFlowchartData = vi.fn();
const mockSetAskLoading = vi.fn();
let mockGenerateResult: any = null;
let mockAutosavedCases: any[] = [];
let mockGenerateForm: any = { motion: 'Existing motion', side: 'pro', format: 'bp', role: 'intro', length: 'brief', audience: 'beginner', tone: 'formal' };
let mockGenerateResultDebateId: string | null | undefined;
const mockSetGenerateResultDebateId = vi.fn((debateId: string | null) => {
    mockGenerateResultDebateId = debateId;
});

let mockRegeneratingSection: string | null = null;
const mockStoreListeners = new Set<() => void>();
const mockSetRegeneratingSection = vi.fn((section: string | null) => {
    mockRegeneratingSection = section;
    mockStoreListeners.forEach((listener) => listener());
});

vi.mock('@/lib/stores/session-store', async () => {
    const React = await import('react');
    const state = () => ({
        generateResult: mockGenerateResult,
        generateLoading: false,
        generateRegeneratingSection: mockRegeneratingSection,
        generateForm: mockGenerateForm,
        generateResultDebateId: mockGenerateResultDebateId,
        autosavedCases: mockAutosavedCases,
        setGenerateResult: mockSetGenerateResult,
        setGenerateLoading: mockSetGenerateLoading,
        setGenerateRegeneratingSection: mockSetRegeneratingSection,
        setGenerateResultDebateId: mockSetGenerateResultDebateId,
        saveCurrentCase: mockSaveCurrentCase,
        addAskMessage: mockAddAskMessage,
        setAskLoading: mockSetAskLoading,
        askMessages: [] as any[],
        setPendingFlowchartData: mockSetPendingFlowchartData,
        recordResult: mockRecordResult,
        updateRecordedResult: mockUpdateRecordedResult,
    });
    const useSessionStore = () => {
        const [, rerender] = React.useReducer((count: number) => count + 1, 0);
        React.useEffect(() => {
            mockStoreListeners.add(rerender);
            return () => { mockStoreListeners.delete(rerender); };
        }, []);
        return state();
    };
    useSessionStore.getState = state;
    useSessionStore.setState = (patch: { generateResultDebateId?: string | null }) => {
        if ('generateResultDebateId' in patch) mockGenerateResultDebateId = patch.generateResultDebateId;
        mockStoreListeners.forEach((listener) => listener());
    };
    return { useSessionStore };
});

vi.mock('@/lib/stores/settings-store', () => ({
    useSettingsStore: () => ({
        getFeatureConfig: vi.fn(() => ({ model: 'google' })),
    }),
}));

// Mock child components to simplify integration test (focus on page logic + wiring)
vi.mock('@/components/features/generate/GenerateForm', () => ({
    GenerateForm: ({ onSubmit, isLoading }: { onSubmit: (data: unknown) => void, isLoading: boolean }) => (
        <div data-testid="generate-form">
            <button
                onClick={() => onSubmit({ topic: 'Test Topic', motion: 'Test Topic', side: 'con' })}
                disabled={isLoading}
                data-testid="submit-button"
            >
                Generate
            </button>
        </div>
    ),
}));

vi.mock('@/components/features/generate/GenerateResults', () => ({
    GenerateResults: ({ result, discoveredSources = [], onDiscuss, onSave, onRegenerateSection, regeneratingSection = null, onPracticeCrossfire, onImportFlowchart, onUndo }: { result: { caseStructure: { thesis: string } }, discoveredSources?: { title: string }[], onDiscuss: () => void, onSave: () => void, onRegenerateSection?: (section: string) => void, regeneratingSection?: string | null, onPracticeCrossfire?: () => void, onImportFlowchart?: () => void, onUndo?: () => void }) => (
        <div data-testid="generate-results" data-regenerating={regeneratingSection ?? ''}>
            <h1>Results for {result.caseStructure.thesis}</h1>
            <div data-testid="discovered-sources">{discoveredSources.map((source) => source.title).join(',')}</div>
            <button onClick={() => onRegenerateSection?.('contentions')} data-testid="regenerate-section">Regenerate section</button>
            <button onClick={onDiscuss}>Discuss</button>
            <button onClick={onSave} data-testid="save-case">Save case</button>
            <button onClick={onPracticeCrossfire} data-testid="open-crossfire">Open Crossfire</button>
            <button onClick={onImportFlowchart} data-testid="import-flowchart">Import flowchart</button>
            <button onClick={onUndo} data-testid="undo-case">Undo case</button>
        </div>
    ),
}));

import { generateCase } from '@/lib/ai/client';
import { enableOneOffMode, seedCurrentDebate, TEST_DEBATE_ID } from '@/test/helpers/debate';

describe('GeneratePage Integration', () => {
    beforeEach(() => {
        enableOneOffMode();
        vi.clearAllMocks();
        mockGenerateResult = null;
        mockAutosavedCases = [];
        mockRegeneratingSection = null;
        mockGenerateResultDebateId = undefined;
        mockGenerateForm = { motion: 'Existing motion', side: 'pro', format: 'bp', role: 'intro', length: 'brief', audience: 'beginner', tone: 'formal' };
    });

    it('reports a rejected case save instead of confirming success', async () => {
        mockGenerateResult = {
            caseStructure: { thesis: 'Existing Thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {},
            counters: [] as any[],
            metadata: {},
        };
        mockSaveCurrentCase.mockRejectedValueOnce(new Error('save failed'));

        render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByTestId('save-case'));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        });
        expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Case Saved' }));
    });

    it('imports a case to the Flowchart only from the debate it belongs to', () => {
        seedCurrentDebate();
        mockGenerateResult = {
            caseStructure: { thesis: 'Existing Thesis', framework: '', keyDefinitions: [], burdenOfProof: '' },
            contentions: [{ id: '1', claim: 'Claim', reasoning: '', evidence: '', needsSource: false, impact: '' }],
            predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
            counters: [],
            metadata: { side: 'pro', format: 'custom', generatedAt: '2026-01-01T00:00:00Z' },
        };
        mockGenerateResultDebateId = 'another-debate';
        const { unmount } = render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('import-flowchart'));
        expect(mockSetPendingFlowchartData).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        unmount();

        mockGenerateResultDebateId = TEST_DEBATE_ID;
        mockAutosavedCases = [{ id: 'older', title: 'Older', createdAt: 1, data: { ...mockGenerateResult } }];
        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('import-flowchart'));
        expect(mockSetPendingFlowchartData).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith('/app/flowchart');

        // Undo brings back a snapshot, which may come from another debate: it is not imported.
        fireEvent.click(screen.getByTestId('undo-case'));
        fireEvent.click(screen.getByTestId('import-flowchart'));
        expect(mockSetPendingFlowchartData).toHaveBeenCalledTimes(1);
    });

    it('does not let a regeneration after Undo overwrite the replaced case\'s saved row', async () => {
        seedCurrentDebate({ motion: 'Test Topic' });
        const newer = {
            caseStructure: { thesis: 'Newer thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {},
            counters: [] as any[],
            metadata: {},
        };
        (generateCase as Mock).mockResolvedValueOnce({ result: newer, discoveredSources: [] })
            .mockResolvedValueOnce({ result: { ...newer, contentions: [{ claim: 'Updated' }] }, discoveredSources: [] });
        const view = render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('submit-button'));
        await waitFor(() => expect(mockRecordResult).toHaveBeenCalledTimes(1));

        // The previous snapshot may belong to another debate; Undo puts it on screen.
        mockGenerateResult = newer;
        mockAutosavedCases = [{ id: 'older', title: 'Older', createdAt: 1, data: { ...newer, caseStructure: { thesis: 'Older thesis' } } }];
        view.rerender(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('undo-case'));

        fireEvent.click(screen.getByTestId('regenerate-section'));
        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(mockSetGenerateResult).toHaveBeenCalledWith(expect.objectContaining({ contentions: [{ claim: 'Updated' }] })));
        expect(mockUpdateRecordedResult).not.toHaveBeenCalled();
    });

    it('opens Crossfire with the generated resolution and argument', () => {
        mockGenerateResult = {
            caseStructure: { thesis: 'Existing Thesis', framework: 'Framework', keyDefinitions: [], burdenOfProof: 'Burden' },
            contentions: [{ id: '1', claim: 'Claim', reasoning: 'Reasoning', evidence: 'Evidence', needsSource: false, impact: 'Impact' }],
            predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
            counters: [],
            metadata: { side: 'pro', format: 'custom', generatedAt: '2026-01-01T00:00:00Z' },
        };

        render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );
        fireEvent.click(screen.getByTestId('open-crossfire'));
        expect(mockNavigate).toHaveBeenCalledWith('/app/crossfire', {
            state: expect.objectContaining({
                source: 'generate',
                resolution: 'Existing motion',
                argument: expect.stringContaining('Thesis: Existing Thesis'),
            }),
        });
    });

    it('replaces displayed provenance after section regeneration', async () => {
        const initialResult = {
            caseStructure: { thesis: 'Existing Thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {},
            counters: [] as any[],
            metadata: {},
        };
        (generateCase as Mock).mockResolvedValueOnce({ result: initialResult, discoveredSources: [{ title: 'Old source', url: 'https://old.example' }] })
          .mockResolvedValueOnce({
            result: { ...initialResult, contentions: [{ claim: 'Updated' }] },
            discoveredSources: [{ title: 'Fresh source', url: 'https://fresh.example' }],
          });

        const view = render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByTestId('submit-button'));
        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(1));

        mockGenerateResult = initialResult;
        view.rerender(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );
        expect(screen.getByTestId('discovered-sources')).toHaveTextContent('Old source');

        fireEvent.click(screen.getByTestId('regenerate-section'));

        await waitFor(() => {
            expect(screen.getByTestId('discovered-sources')).toHaveTextContent('Fresh source');
        });
        expect(screen.getByTestId('discovered-sources')).not.toHaveTextContent('Old source');
    });

    it('keeps the results on screen while one section regenerates', async () => {
        mockGenerateResult = {
            caseStructure: { thesis: 'Existing Thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {},
            counters: [] as any[],
            metadata: {},
        };
        let finish: (value: unknown) => void = () => undefined;
        (generateCase as Mock).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

        render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByTestId('regenerate-section'));

        expect(screen.getByTestId('generate-results')).toHaveAttribute('data-regenerating', 'contentions');
        expect(screen.getByTestId('submit-button')).toBeDisabled();
        expect(mockSetGenerateLoading).not.toHaveBeenCalled();

        // A second click while the first is in flight would merge over a stale result.
        fireEvent.click(screen.getByTestId('regenerate-section'));
        expect(generateCase).toHaveBeenCalledTimes(1);

        finish({ result: { ...mockGenerateResult, contentions: [{ claim: 'Updated' }] }, discoveredSources: [] });
        await waitFor(() => expect(screen.getByTestId('generate-results')).toHaveAttribute('data-regenerating', ''));
        expect(mockSetGenerateLoading).not.toHaveBeenCalled();
    });

    it('keeps a pending regeneration visible after leaving Generate and coming back', async () => {
        mockGenerateResult = { caseStructure: { thesis: 'Existing Thesis' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[], metadata: {} };
        (generateCase as Mock).mockReturnValueOnce(new Promise(() => undefined));

        const first = render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('regenerate-section'));
        first.unmount();

        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        expect(screen.getByTestId('generate-results')).toHaveAttribute('data-regenerating', 'contentions');
        expect(screen.getByTestId('submit-button')).toBeDisabled();
        fireEvent.click(screen.getByTestId('regenerate-section'));
        expect(generateCase).toHaveBeenCalledTimes(1);
    });

    it('drops a regenerated section when the case changed while it was running', async () => {
        const original = { caseStructure: { thesis: 'Existing Thesis' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[], metadata: {} };
        mockGenerateResult = original;
        let finish: (value: unknown) => void = () => undefined;
        (generateCase as Mock).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('regenerate-section'));

        // Undo, or a new generation, replaced the case before the section came back.
        mockGenerateResult = { ...original, caseStructure: { thesis: 'Restored Thesis' } };
        finish({ result: { ...original, contentions: [{ claim: 'Updated' }] }, discoveredSources: [] });

        await waitFor(() => expect(mockSetRegeneratingSection).toHaveBeenLastCalledWith(null));
        expect(mockSetGenerateResult).not.toHaveBeenCalled();
        expect(mockUpdateRecordedResult).not.toHaveBeenCalled();
    });

    it('records the case in the Current Debate with its side automatically', async () => {
        seedCurrentDebate({ motion: 'Test Topic' });
        const result = { caseStructure: { thesis: 'Debate thesis' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[] };
        (generateCase as Mock).mockResolvedValue({ result, discoveredSources: [] });

        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('submit-button'));

        await waitFor(() => expect(mockRecordResult).toHaveBeenCalledWith('case', expect.objectContaining({
            title: 'Test Topic',
            debateId: TEST_DEBATE_ID,
            side: 'con',
            output: result,
        })));
        // Sources come from the same debate.
        expect((generateCase as Mock).mock.calls[0][3]).toBe(TEST_DEBATE_ID);
        expect(screen.getByTestId('current-debate-strip')).toHaveTextContent('Working in: Test Topic');
    });

    it('keeps one-off results out of every debate', async () => {
        const result = { caseStructure: { thesis: 'One-off' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[] };
        (generateCase as Mock).mockResolvedValue({ result, discoveredSources: [] });

        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('submit-button'));

        await waitFor(() => expect(mockSetGenerateResult).toHaveBeenCalledWith(result));
        expect(mockRecordResult).not.toHaveBeenCalled();
        expect((generateCase as Mock).mock.calls[0][3]).toBeNull();
    });

    it('regenerates a one-off case without another debate\'s sources', async () => {
        const result = { caseStructure: { thesis: 'One-off' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[], metadata: {} };
        (generateCase as Mock).mockResolvedValue({ result, discoveredSources: [] });
        const view = render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('submit-button'));
        await waitFor(() => expect(mockSetGenerateResult).toHaveBeenCalledWith(result));

        // The student then starts a debate on the same motion as the stored form.
        seedCurrentDebate({ motion: 'Existing motion' });
        mockGenerateResult = result;
        view.rerender(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('regenerate-section'));

        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(2));
        expect((generateCase as Mock).mock.calls[1][3]).toBeNull();
    });

    it('regenerates a loaded case with that case\'s motion and debate', async () => {
        seedCurrentDebate({ motion: 'Existing motion' });
        mockGenerateResultDebateId = 'loaded-debate';
        mockGenerateResult = {
            caseStructure: { thesis: 'Loaded thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {},
            counters: [] as any[],
            metadata: { side: 'con', format: 'custom', motion: 'Loaded motion', generatedAt: '2026-01-01T00:00:00Z' },
        };
        (generateCase as Mock).mockResolvedValue({ result: mockGenerateResult, discoveredSources: [] });

        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('regenerate-section'));

        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(1));
        expect((generateCase as Mock).mock.calls[0][0]).toEqual(expect.objectContaining({
            motion: 'Loaded motion',
            side: 'con',
        }));
        expect((generateCase as Mock).mock.calls[0][3]).toBe('loaded-debate');
    });

    it('after a reload, regenerates in the Current Debate only when the motion matches', async () => {
        const result = { caseStructure: { thesis: 'Restored' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[], metadata: {} };
        (generateCase as Mock).mockResolvedValue({ result, discoveredSources: [] });
        mockGenerateResult = result;

        seedCurrentDebate({ motion: 'Existing motion' });
        const view = render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('regenerate-section'));
        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(1));
        expect((generateCase as Mock).mock.calls[0][3]).toBe(TEST_DEBATE_ID);
        view.unmount();

        seedCurrentDebate({ motion: 'A different motion' });
        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('regenerate-section'));
        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(2));
        expect((generateCase as Mock).mock.calls[1][3]).toBeNull();
    });

    it('keeps a successful case on screen when saving it to the debate fails', async () => {
        seedCurrentDebate({ motion: 'Test Topic' });
        mockRecordResult.mockRejectedValueOnce(new Error('offline'));
        const result = { caseStructure: { thesis: 'Kept' }, contentions: [] as any[], predictedOpponentCase: {}, counters: [] as any[] };
        (generateCase as Mock).mockResolvedValue({ result, discoveredSources: [] });

        render(<BrowserRouter><GeneratePage /></BrowserRouter>);
        fireEvent.click(screen.getByTestId('submit-button'));

        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not save this result to the debate' })));
        expect(mockSetGenerateResult).toHaveBeenCalledWith(result);
        // The run itself succeeded: no failure panel and no failure toast.
        expect(screen.queryByText(/Generation Failed/i)).toBeNull();
        expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: expect.stringMatching(/Generation Failed/i) }));
    });
});
