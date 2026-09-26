
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
const mockSetAskLoading = vi.fn();
let mockGenerateResult: any = null;
let mockGenerateForm: any = { motion: 'Existing motion', side: 'pro', format: 'bp', role: 'intro', length: 'brief', audience: 'beginner', tone: 'formal' };

vi.mock('@/lib/stores/session-store', () => ({
    useSessionStore: () => ({
        generateResult: mockGenerateResult,
        generateLoading: false,
        generateForm: mockGenerateForm,
        autosavedCases: [] as any[],
        setGenerateResult: mockSetGenerateResult,
        setGenerateLoading: mockSetGenerateLoading,
        saveCurrentCase: mockSaveCurrentCase,
        addAskMessage: mockAddAskMessage,
        setAskLoading: mockSetAskLoading,
        askMessages: [] as any[],
        setPendingFlowchartData: vi.fn(),
        recordResult: mockRecordResult,
        updateRecordedResult: mockUpdateRecordedResult,
    }),
}));

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
    GenerateResults: ({ result, discoveredSources = [], onDiscuss, onSave, onRegenerateSection, onPracticeCrossfire }: { result: { caseStructure: { thesis: string } }, discoveredSources?: { title: string }[], onDiscuss: () => void, onSave: () => void, onRegenerateSection?: (section: string) => void, onPracticeCrossfire?: () => void }) => (
        <div data-testid="generate-results">
            <h1>Results for {result.caseStructure.thesis}</h1>
            <div data-testid="discovered-sources">{discoveredSources.map((source) => source.title).join(',')}</div>
            <button onClick={() => onRegenerateSection?.('contentions')} data-testid="regenerate-section">Regenerate section</button>
            <button onClick={onDiscuss}>Discuss</button>
            <button onClick={onSave} data-testid="save-case">Save case</button>
            <button onClick={onPracticeCrossfire} data-testid="open-crossfire">Open Crossfire</button>
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
        mockGenerateForm = { motion: 'Existing motion', side: 'pro', format: 'bp', role: 'intro', length: 'brief', audience: 'beginner', tone: 'formal' };
    });

    it('renders the empty state initially', () => {
        // Override store mock for this test if needed, but default is null result
        render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );

        expect(screen.getByText('Ready to Generate')).toBeInTheDocument();
        expect(screen.getByTestId('generate-form')).toBeInTheDocument();
        expect(screen.queryByTestId('generate-results')).not.toBeInTheDocument();
    });

    it('handles form submission and successful generation', async () => {
        // Setup API mock
        const mockResult = {
            caseStructure: { thesis: 'Test Thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {},
            counters: [] as any[]
        };
        (generateCase as Mock).mockResolvedValue({ result: mockResult, discoveredSources: [] });

        render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );

        // Trigger submit
        fireEvent.click(screen.getByTestId('submit-button'));

        // Verify loading state calls
        expect(mockSetGenerateLoading).toHaveBeenCalledWith(true);

        // Wait for API call
        await waitFor(() => {
            expect(generateCase).toHaveBeenCalled();
        });

        // Verify result setting and completion
        await waitFor(() => {
            expect(mockSetGenerateResult).toHaveBeenCalledWith(mockResult);
            expect(mockSetGenerateLoading).toHaveBeenCalledWith(false);
        });
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

    it('displays results when store has data', () => {
        mockGenerateResult = {
            caseStructure: { thesis: 'Existing Thesis' },
            contentions: [] as any[],
            predictedOpponentCase: {
                likelyArguments: [] as any[],
                strategicWeaknesses: [] as any[],
                keyClashes: [] as any[],
            },
            counters: [] as any[],
            metadata: {
                side: 'pro',
                format: 'bp',
                generatedAt: '2024-01-01T00:00:00Z',
            },
        };

        render(
            <BrowserRouter>
                <GeneratePage />
            </BrowserRouter>
        );

        expect(screen.getByTestId('generate-results')).toBeInTheDocument();
        expect(screen.getByText('Results for Existing Thesis')).toBeInTheDocument();
        expect(screen.queryByText('Ready to Generate')).not.toBeInTheDocument();
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
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Generate complete' }));
        expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: expect.stringMatching(/Generation Failed/i) }));
    });
});
