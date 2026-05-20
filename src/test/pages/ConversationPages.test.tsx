/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockAskChat = vi.fn();
const mockIsAskStreamingSupported = vi.fn(() => false);
const mockStreamAskChat = vi.fn();
const mockBrainstorm = vi.fn();
const mockFactoids = vi.fn();
const mockIsTimeoutError = vi.fn(() => false);

const sessionState = {
  askMessages: [] as any[],
  askLoading: false,
  addAskMessage: vi.fn(),
  setAskLoading: vi.fn(),
  clearAskMessages: vi.fn(),
  addSource: vi.fn(),
  brainstormResult: null as any,
  brainstormLoading: false,
  setBrainstormResult: vi.fn(),
  setBrainstormLoading: vi.fn(),
  factoidsResult: null as any,
  factoidsLoading: false,
  setFactoidsResult: vi.fn(),
  setFactoidsLoading: vi.fn(),
};

const subErrorState = {
  limitModalOpen: false,
  limitModalVariant: 'limit_reached' as const,
  limitModalLimit: undefined as number | undefined,
  limitModalCurrent: undefined as number | undefined,
  modelModalOpen: false,
  pricingModalOpen: false,
  setLimitModalOpen: vi.fn(),
  setModelModalOpen: vi.fn(),
  setPricingModalOpen: vi.fn(),
  handleSubscriptionError: vi.fn(() => false),
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/hooks/use-subscription-error', () => ({
  useSubscriptionError: () => subErrorState,
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: () => sessionState,
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: () => ({
    getFeatureConfig: vi.fn(() => ({ provider: 'openai', model: 'gpt-4o', temperature: 0.7 })),
  }),
}));

vi.mock('@/lib/ai/client', () => ({
  askChat: (...args: any[]) => mockAskChat(...args),
  brainstorm: (...args: any[]) => mockBrainstorm(...args),
  factoids: (...args: any[]) => mockFactoids(...args),
  isTimeoutError: (...args: any[]) => mockIsTimeoutError(...args),
}));

vi.mock('@/lib/ai/streaming', () => ({
  isAskStreamingSupported: (...args: any[]) => mockIsAskStreamingSupported(...args),
  streamAskChat: (...args: any[]) => mockStreamAskChat(...args),
}));

vi.mock('@/components/features/subscription', () => ({
  LimitReachedModal: () => null,
  ModelRestrictedModal: () => null,
  PricingModal: () => null,
}));

vi.mock('@/components/features/ask/AskChat', () => ({
  AskChat: ({ onSend, onSaveSource }: { onSend: (...args: any[]) => Promise<void>, onSaveSource: (t: string, c: string) => void }) => (
    <div>
      <button type="button" onClick={() => void onSend('How do I frame this?', 'general', true, true, true, true)} data-testid="ask-send">send</button>
      <button type="button" onClick={() => onSaveSource('Saved Title', 'Saved Content')} data-testid="ask-save">save-source</button>
    </div>
  ),
}));

vi.mock('@/components/features/brainstorm/BrainstormForm', () => ({
  BrainstormForm: ({ onSubmit }: { onSubmit: (input: any) => void }) => (
    <button type="button" onClick={() => onSubmit({ motion: 'Topic', side: 'both', outputMode: 'topfive' })} data-testid="brainstorm-submit">
      brainstorm-submit
    </button>
  ),
}));

vi.mock('@/components/features/brainstorm/BrainstormResults', () => ({
  BrainstormResults: ({ onDiscuss }: { onDiscuss: () => void }) => (
    <button type="button" onClick={() => void onDiscuss()} data-testid="brainstorm-discuss">brainstorm-discuss</button>
  ),
}));

vi.mock('@/components/features/factoids/FactoidsForm', () => ({
  FactoidsForm: ({ onSubmit }: { onSubmit: (input: any) => void }) => (
    <button type="button" onClick={() => onSubmit({ claim: 'Claim', sourceType: 'any', language: 'en' })} data-testid="factoids-submit">
      factoids-submit
    </button>
  ),
}));

vi.mock('@/components/features/factoids/FactoidsResults', () => ({
  FactoidsResults: ({ onDiscuss, onSaveSource }: { onDiscuss: () => void, onSaveSource: (t: string, c: string, u?: string) => void }) => (
    <div>
      <button type="button" onClick={() => void onDiscuss()} data-testid="factoids-discuss">factoids-discuss</button>
      <button type="button" onClick={() => onSaveSource('Fact source', 'Fact content', 'https://example.com')} data-testid="factoids-save">
        factoids-save
      </button>
    </div>
  ),
}));

import AskPage from '@/pages/AskPage';
import BrainstormPage from '@/pages/BrainstormPage';
import FactoidsPage from '@/pages/FactoidsPage';

describe('Conversation Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sessionState.askMessages = [];
    sessionState.askLoading = false;
    sessionState.brainstormResult = null;
    sessionState.brainstormLoading = false;
    sessionState.factoidsResult = null;
    sessionState.factoidsLoading = false;

    subErrorState.handleSubscriptionError.mockReturnValue(false);
    mockIsTimeoutError.mockReturnValue(false);
    mockIsAskStreamingSupported.mockReturnValue(false);
  });

  it('AskPage sends user message and appends AI response', async () => {
    mockAskChat.mockResolvedValueOnce({ response: 'Try value framing.', followUpQuestions: [], uncertainties: [] });

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));

    await waitFor(() => {
      expect(mockAskChat).toHaveBeenCalled();
    });

    expect(mockAskChat).toHaveBeenCalledWith(
      'How do I frame this?',
      [],
      'general',
      { provider: 'openai', model: 'gpt-4o', temperature: 0.7 },
      { citationMode: true, webSearch: true, prosConsMode: true, argumentMapMode: true }
    );
    expect(sessionState.addAskMessage).toHaveBeenCalledWith({ role: 'user', content: 'How do I frame this?' });
    expect(sessionState.addAskMessage).toHaveBeenCalledWith({
      role: 'assistant',
      content: 'Try value framing.',
      output: { response: 'Try value framing.', followUpQuestions: [], uncertainties: [] },
    });
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(true);
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(false);
  });

  it('AskPage shows timeout toast for timeout errors', async () => {
    mockAskChat.mockRejectedValueOnce(new Error('timeout'));
    mockIsTimeoutError.mockReturnValueOnce(true);

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Request Timed Out' }));
    });
  });

  it('AskPage streams basic ask replies when supported', async () => {
    mockIsAskStreamingSupported.mockReturnValueOnce(true);
    mockStreamAskChat.mockImplementationOnce(async (...args: any[]) => {
      const handlers = args[5];
      handlers.onDelta('Try ');
      handlers.onDelta('value framing.');
      return { response: 'Try value framing.', followUpQuestions: [], uncertainties: [] };
    });

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));

    await waitFor(() => {
      expect(mockStreamAskChat).toHaveBeenCalled();
    });

    expect(mockAskChat).not.toHaveBeenCalled();
    expect(sessionState.addAskMessage).toHaveBeenCalledWith({
      role: 'assistant',
      content: 'Try value framing.',
      output: { response: 'Try value framing.', followUpQuestions: [], uncertainties: [] },
    });
  });

  it('AskPage saves source to library', () => {
    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-save'));

    expect(sessionState.addSource).toHaveBeenCalledWith({ title: 'Saved Title', content: 'Saved Content', type: 'text' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved' }));
  });

  it('BrainstormPage submits and stores brainstorm results', async () => {
    mockBrainstorm.mockResolvedValueOnce({ needsMoreInfo: false, nextSteps: ['A'], warningsAndTradeoffs: [] });

    render(
      <BrowserRouter>
        <BrainstormPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('brainstorm-submit'));

    await waitFor(() => {
      expect(mockBrainstorm).toHaveBeenCalled();
    });

    expect(sessionState.setBrainstormLoading).toHaveBeenCalledWith(true);
    expect(sessionState.setBrainstormResult).toHaveBeenCalledWith({ needsMoreInfo: false, nextSteps: ['A'], warningsAndTradeoffs: [] });
    expect(sessionState.setBrainstormLoading).toHaveBeenCalledWith(false);
  });

  it('BrainstormPage discuss flow navigates to ask and creates follow-up response', async () => {
    sessionState.brainstormResult = {
      needsMoreInfo: false,
      nextSteps: [],
      warningsAndTradeoffs: [],
      topFive: [{ rank: 1, idea: { title: 'Best idea', side: 'pro' } }],
    };
    mockAskChat.mockResolvedValueOnce({ response: 'Expand this angle.', followUpQuestions: [], uncertainties: [] });

    render(
      <BrowserRouter>
        <BrainstormPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('brainstorm-discuss'));

    await waitFor(() => {
      expect(mockAskChat).toHaveBeenCalled();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/app/ask');
    expect(sessionState.addAskMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }));
    expect(sessionState.addAskMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant', content: 'Expand this angle.' }));
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(true);
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(false);
  });

  it('FactoidsPage submits and stores factoid results', async () => {
    mockFactoids.mockResolvedValueOnce({ factoids: [], searchSuggestions: [], warnings: [], verificationStatus: 'complete' });

    render(
      <BrowserRouter>
        <FactoidsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('factoids-submit'));

    await waitFor(() => {
      expect(mockFactoids).toHaveBeenCalled();
    });

    expect(sessionState.setFactoidsLoading).toHaveBeenCalledWith(true);
    expect(sessionState.setFactoidsResult).toHaveBeenCalledWith({ factoids: [], searchSuggestions: [], warnings: [], verificationStatus: 'complete' });
    expect(sessionState.setFactoidsLoading).toHaveBeenCalledWith(false);
  });

  it('FactoidsPage discuss flow navigates and appends assistant response', async () => {
    sessionState.factoidsResult = {
      factoids: [{ shortClaim: 'Claim A', citation: { publisher: 'Source A' } }],
      searchSuggestions: [],
      warnings: [],
      verificationStatus: 'complete',
    };
    mockAskChat.mockResolvedValueOnce({ response: 'Use this evidence in rebuttal.', followUpQuestions: [], uncertainties: [] });

    render(
      <BrowserRouter>
        <FactoidsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('factoids-discuss'));

    await waitFor(() => {
      expect(mockAskChat).toHaveBeenCalled();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/app/ask');
    expect(sessionState.addAskMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant', content: 'Use this evidence in rebuttal.' }));
  });

  it('FactoidsPage saves selected evidence to source library', () => {
    sessionState.factoidsResult = {
      factoids: [{ shortClaim: 'Claim A', citation: { publisher: 'Source A' } }],
      searchSuggestions: [],
      warnings: [],
      verificationStatus: 'complete',
    };

    render(
      <BrowserRouter>
        <FactoidsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('factoids-save'));

    expect(sessionState.addSource).toHaveBeenCalledWith({
      title: 'Fact source',
      content: 'Fact content',
      type: 'url',
      origin: 'https://example.com',
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved to Library' }));
  });
});
