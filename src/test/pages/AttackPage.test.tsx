
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AttackPage from '@/pages/AttackPage';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/lib/ai/client', () => ({
    attackCase: vi.fn(),
    askChat: vi.fn(),
}));

// Mock hooks
const mockNavigate = vi.fn();
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockToast = vi.fn();
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: mockToast }),
}));

// Mock stores
const mockSetAttackLoading = vi.fn();
const mockSetAttackResult = vi.fn();
const mockAddAskMessage = vi.fn();
const mockSetAskLoading = vi.fn();

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/lib/stores/session-store', () => ({
    useSessionStore: () => ({
        attackResult: null as any, // Default state
        attackLoading: false,
        setAttackResult: mockSetAttackResult,
        setAttackLoading: mockSetAttackLoading,
        addAskMessage: mockAddAskMessage,
        setAskLoading: mockSetAskLoading,
        askMessages: [] as any[],
    }),
}));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/lib/stores/settings-store', () => ({
    useSettingsStore: () => ({
        getFeatureConfig: vi.fn(() => ({ model: 'google' })),
    }),
}));

// Mock child components
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/components/features/attack/AttackForm', () => ({
    AttackForm: ({ onSubmit, isLoading }: { onSubmit: (data: unknown) => void, isLoading: boolean }) => (
        <div data-testid="attack-form">
            <button
                onClick={() => onSubmit({ caseContent: 'Test Content' })}
                disabled={isLoading}
                data-testid="submit-button"
            >
                Attack
            </button>
        </div>
    ),
}));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));
vi.mock('@/components/features/attack/AttackResults', () => ({
    AttackResults: ({ result, onDiscuss }: { result: { overallAssessment: { score: number } }, onDiscuss: () => void }) => (
        <div data-testid="attack-results">
            <h1>Score {result.overallAssessment.score}</h1>
            <button onClick={onDiscuss}>Discuss</button>
        </div>
    ),
}));

import { attackCase } from '@/lib/ai/client';

describe('AttackPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the empty state initially', () => {
        render(
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AttackPage />
            </BrowserRouter>
        );

        expect(screen.getByText('Attack My Case')).toBeInTheDocument();
        expect(screen.getByTestId('attack-form')).toBeInTheDocument();
        expect(screen.queryByTestId('attack-results')).not.toBeInTheDocument();
    });

    it('handles form submission and successful attack', async () => {
        // Setup API mock
        const mockResult = {
            overallAssessment: { score: 85, summary: 'Good case' },
            weaknesses: [] as any[],
            fallacies: [] as any[],
            fallacyScore: 0,
            recommendations: [] as any[]
        };
        (attackCase as Mock).mockResolvedValue(mockResult);

        render(
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AttackPage />
            </BrowserRouter>
        );

        // Trigger submit
        fireEvent.click(screen.getByTestId('submit-button'));

        // Verify loading state calls
        expect(mockSetAttackLoading).toHaveBeenCalledWith(true);

        // Wait for API call
        await waitFor(() => {
            expect(attackCase).toHaveBeenCalled();
        });

        // Verify result setting
        expect(mockSetAttackResult).toHaveBeenCalledWith(mockResult);
        expect(mockSetAttackLoading).toHaveBeenCalledWith(false);
    });
});
