
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GeneratePage from '@/pages/GeneratePage';
import { BrowserRouter } from 'react-router-dom';

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

vi.mock('@/lib/stores/session-store', () => ({
    useSessionStore: () => ({
        generateResult: mockGenerateResult,
        generateLoading: false,
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
    GenerateResults: ({ result, onRegenerateSection, onDiscuss }: { result: { caseStructure: { thesis: string } }, onRegenerateSection: unknown, onDiscuss: () => void }) => (
        <div data-testid="generate-results">
            <h1>Results for {result.caseStructure.thesis}</h1>
            <button onClick={onDiscuss}>Discuss</button>
        </div>
    ),
}));

import { generateCase } from '@/lib/ai/client';

describe('GeneratePage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGenerateResult = null;
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
        (generateCase as Mock).mockResolvedValue(mockResult);

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

        // Verify result setting
        expect(mockSetGenerateResult).toHaveBeenCalledWith(mockResult);
        expect(mockSetGenerateLoading).toHaveBeenCalledWith(false);
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
});
