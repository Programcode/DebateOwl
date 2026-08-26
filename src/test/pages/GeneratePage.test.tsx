
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
}));

// Mock stores
const mockSetGenerateLoading = vi.fn();
const mockSetGenerateResult = vi.fn();
const mockSaveCurrentCase = vi.fn();
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
                onClick={() => onSubmit({ topic: 'Test Topic' })}
                disabled={isLoading}
                data-testid="submit-button"
            >
                Generate
            </button>
        </div>
    ),
}));

vi.mock('@/components/features/generate/GenerateResults', () => ({
    GenerateResults: ({ result, discoveredSources = [], onDiscuss, onSave, onRegenerateSection }: { result: { caseStructure: { thesis: string } }, discoveredSources?: { title: string }[], onDiscuss: () => void, onSave: () => void, onRegenerateSection?: (section: string) => void }) => (
        <div data-testid="generate-results">
            <h1>Results for {result.caseStructure.thesis}</h1>
            <div data-testid="discovered-sources">{discoveredSources.map((source) => source.title).join(',')}</div>
            <button onClick={() => onRegenerateSection?.('contentions')} data-testid="regenerate-section">Regenerate section</button>
            <button onClick={onDiscuss}>Discuss</button>
            <button onClick={onSave} data-testid="save-case">Save case</button>
        </div>
    ),
}));

import { generateCase } from '@/lib/ai/client';

describe('GeneratePage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGenerateResult = null;
        mockGenerateForm = { motion: 'Existing motion', side: 'pro', format: 'bp', role: 'intro', length: 'brief', audience: 'beginner', tone: 'formal' };
    });

    it('renders the empty state initially', () => {
        // Override store mock for this test if needed, but default is null result
        render(
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

        await new Promise((resolve) => setTimeout(resolve, 120));

        // Verify result setting
        expect(mockSetGenerateResult).toHaveBeenCalledWith(mockResult);
        expect(mockSetGenerateLoading).toHaveBeenCalledWith(false);
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <GeneratePage />
            </BrowserRouter>
        );

        expect(screen.getByTestId('generate-results')).toBeInTheDocument();
        expect(screen.getByText('Results for Existing Thesis')).toBeInTheDocument();
        expect(screen.queryByText('Ready to Generate')).not.toBeInTheDocument();
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
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <GeneratePage />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByTestId('submit-button'));
        await waitFor(() => expect(generateCase).toHaveBeenCalledTimes(1));

        mockGenerateResult = initialResult;
        view.rerender(
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <GeneratePage />
            </BrowserRouter>
        );
        expect(screen.getByTestId('discovered-sources')).toHaveTextContent('Old source');

        fireEvent.click(screen.getByTestId('regenerate-section'));

        await waitFor(() => {
            expect(screen.getByTestId('discovered-sources')).toHaveTextContent('Fresh source');
        });
        expect(screen.getByTestId('discovered-sources')).not.toHaveTextContent('Old source');
        await new Promise((resolve) => setTimeout(resolve, 120));
    });
});
