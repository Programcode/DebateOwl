/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockAskChat = vi.fn();
const mockIsAskStreamingSupported = vi.fn(
  (_config: unknown, _options?: { mode?: string }) => false,
);
const mockStreamAskChat = vi.fn();
const mockBrainstorm = vi.fn();
const mockFactoids = vi.fn();
const mockIsTimeoutError = vi.fn(() => false);

const drainAsyncWork = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
};

const sessionState = {
  askMessages: [] as any[],
  askLoading: false,
  askStreamingAssistant: null as any,
  addAskMessage: vi.fn(),
  setAskLoading: vi.fn(),
  setAskStreamingAssistant: vi.fn(),
  appendAskStreamingDelta: vi.fn(),
  clearAskMessages: vi.fn(),
  saveCurrentChat: vi.fn(),
  loadSavedChat: vi.fn(),
  savedChats: [] as any[],
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
  askChat: (...args: unknown[]) => (mockAskChat as (...callArgs: unknown[]) => unknown)(...args),
  brainstorm: (...args: unknown[]) => (mockBrainstorm as (...callArgs: unknown[]) => unknown)(...args),
  factoids: (...args: unknown[]) => (mockFactoids as (...callArgs: unknown[]) => unknown)(...args),
  isAskMessageWithinBudget: (message: string) => new TextEncoder().encode(message).byteLength <= 80_000,
  isTimeoutError: (...args: unknown[]) => (mockIsTimeoutError as (...callArgs: unknown[]) => unknown)(...args),
}));

vi.mock('@/lib/ai/streaming', () => ({
  isAskStreamingSupported: (...args: unknown[]) => (mockIsAskStreamingSupported as (...callArgs: unknown[]) => unknown)(...args),
  streamAskChat: (...args: unknown[]) => (mockStreamAskChat as (...callArgs: unknown[]) => unknown)(...args),
}));

vi.mock('@/components/features/subscription', () => ({
  LimitReachedModal: (): null => null,
  ModelRestrictedModal: (): null => null,
  PricingModal: (): null => null,
}));

vi.mock('@/components/features/ask/AskChat', () => ({
  AskChat: ({ onSend, onClear, onLoadChat, onSaveChat, onSaveSource }: { onSend: (...args: any[]) => Promise<void>, onClear: () => void, onLoadChat?: (id: string) => void, onSaveChat: () => void, onSaveSource: (t: string, c: string) => void }) => (
    <div>
      <button type="button" onClick={() => void onSend('How do I frame this?', 'general', true, true, true, true)} data-testid="ask-send">send</button>
      <button type="button" onClick={() => void onSend('What should I clarify?', 'clarify', false, false, false, false)} data-testid="ask-clarify">clarify</button>
      <button type="button" onClick={() => void onSend('😀'.repeat(30_000), 'clarify', false, false, false, false)} data-testid="ask-oversized">oversized</button>
      <button type="button" onClick={onClear} data-testid="ask-clear">clear</button>
      <button type="button" onClick={() => onLoadChat?.('saved-chat')} data-testid="ask-load-chat">load-chat</button>
      <button type="button" onClick={onSaveChat} data-testid="ask-save-chat">save-chat</button>
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
  FactoidsResults: ({ onDiscuss, onSaveSource, discoveredSources }: { onDiscuss: () => void, onSaveSource: (t: string, c: string, u?: string) => void, discoveredSources?: unknown[] }) => (
    <div>
      <output data-testid="factoids-source-count">{discoveredSources?.length ?? 0}</output>
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
import { enableOneOffMode } from '@/test/helpers/debate';

describe('Conversation Pages', () => {
  beforeEach(() => {
    enableOneOffMode();
    vi.clearAllMocks();

    sessionState.askMessages = [];
    sessionState.askLoading = false;
    sessionState.askStreamingAssistant = null;
    sessionState.brainstormResult = null;
    sessionState.brainstormLoading = false;
    sessionState.factoidsResult = null;
    sessionState.factoidsLoading = false;
    sessionState.setFactoidsResult.mockImplementation((result: any) => {
      sessionState.factoidsResult = result;
    });

    subErrorState.handleSubscriptionError.mockReturnValue(false);
    mockIsTimeoutError.mockReturnValue(false);
    mockIsAskStreamingSupported.mockReturnValue(false);
    sessionState.setAskStreamingAssistant.mockClear();
    sessionState.appendAskStreamingDelta.mockClear();
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
      output: expect.objectContaining({ response: 'Try value framing.', followUpQuestions: [], uncertainties: [] }),
    });
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(true);
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(false);
  });

  it('AskPage excludes private chat history from workspace requests', async () => {
    sessionState.askMessages = [{ role: 'user', content: 'Private question' }];
    mockAskChat.mockResolvedValueOnce({ response: 'Workspace answer', followUpQuestions: [], uncertainties: [] });
    const workspaceContext: WorkspaceToolContext = {
      documentEpoch: 2,
      documentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      documentIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      documentText: 'Accepted text',
      documentTitle: 'R1',
      motion: 'Motion',
      requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      returnUrl: '/app/workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      side: 'pro',
      sourceIds: [],
      threadRequest: null,
      threadId: null,
      workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/app/ask', state: { workspaceContext } }]}>
        <AskPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('ask-send'));

    await waitFor(() => expect(mockAskChat).toHaveBeenCalled());
    expect(mockAskChat.mock.calls[0][1]).toEqual([]);
    expect(mockAskChat.mock.calls[0][4]).toEqual(expect.objectContaining({ workspaceContext }));
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

  it('AskPage rejects an oversized multibyte message before calling AI', async () => {
    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-oversized'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Message is too large' }));
    });
    expect(mockAskChat).not.toHaveBeenCalled();
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
      output: expect.objectContaining({ response: 'Try value framing.', followUpQuestions: [], uncertainties: [] }),
    });
  });

  it('AskPage keeps clarify mode on the deterministic non-streaming path', async () => {
    mockIsAskStreamingSupported.mockImplementation(
      (_config: unknown, options?: { mode?: string }) => options?.mode !== 'clarify',
    );
    mockAskChat.mockResolvedValueOnce({
      response: 'Please specify the governing ruleset.',
      followUpQuestions: ['Which ruleset applies?'],
      uncertainties: [],
    });

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-clarify'));

    await waitFor(() => {
      expect(mockAskChat).toHaveBeenCalledWith(
        'What should I clarify?',
        [],
        'clarify',
        { provider: 'openai', model: 'gpt-4o', temperature: 0.7 },
        { citationMode: false, webSearch: false, prosConsMode: false, argumentMapMode: false },
      );
    });
    expect(mockStreamAskChat).not.toHaveBeenCalled();
  });

  it('drops buffered deltas from an aborted stream when a newer request starts', async () => {
    mockIsAskStreamingSupported.mockReturnValue(true);
    let firstHandlers: any;
    mockStreamAskChat
      .mockImplementationOnce((...args: any[]) => {
        firstHandlers = args[5];
        return new Promise((_resolve, reject) => {
          firstHandlers.signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      })
      .mockImplementationOnce(async (...args: any[]) => {
        const handlers = args[5];
        handlers.onDelta('new response');
        return { response: 'new response', followUpQuestions: [], uncertainties: [] };
      });

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));
    await waitFor(() => expect(firstHandlers).toBeDefined());
    firstHandlers.onDelta('stale response');

    fireEvent.click(screen.getByTestId('ask-send'));

    await waitFor(() => {
      expect(mockStreamAskChat).toHaveBeenCalledTimes(2);
      expect(sessionState.addAskMessage).toHaveBeenCalledWith(expect.objectContaining({
        role: 'assistant',
        content: 'new response',
      }));
    });

    expect(sessionState.appendAskStreamingDelta).not.toHaveBeenCalledWith('stale response');
  });

  it('ignores a stream that resolves after a clarify request replaces it', async () => {
    mockIsAskStreamingSupported.mockImplementation(
      (_config: unknown, options?: { mode?: string }) => options?.mode !== 'clarify',
    );
    let resolveOldStream!: (value: unknown) => void;
    let resolveClarify!: (value: unknown) => void;
    let firstHandlers: any;
    mockStreamAskChat.mockImplementationOnce((...args: any[]) => {
      firstHandlers = args[5];
      return new Promise((resolve) => {
        resolveOldStream = resolve;
      });
    });
    mockAskChat.mockImplementationOnce(() => new Promise((resolve) => {
      resolveClarify = resolve;
    }));

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));
    await waitFor(() => expect(firstHandlers).toBeDefined());

    sessionState.setAskLoading.mockClear();
    fireEvent.click(screen.getByTestId('ask-clarify'));
    await waitFor(() => expect(mockAskChat).toHaveBeenCalledWith(
      'What should I clarify?',
      [],
      'clarify',
      { provider: 'openai', model: 'gpt-4o', temperature: 0.7 },
      { citationMode: false, webSearch: false, prosConsMode: false, argumentMapMode: false },
    ));

    sessionState.setAskLoading.mockClear();
    sessionState.setAskStreamingAssistant.mockClear();
    resolveOldStream({ response: 'stale response', followUpQuestions: [], uncertainties: [] });
    await drainAsyncWork();

    expect(sessionState.addAskMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: 'stale response',
    }));
    expect(sessionState.appendAskStreamingDelta).not.toHaveBeenCalled();
    expect(sessionState.setAskStreamingAssistant).not.toHaveBeenCalledWith(null);
    expect(sessionState.setAskLoading).not.toHaveBeenCalledWith(false);

    resolveClarify({ response: 'Please specify the governing ruleset.', followUpQuestions: [], uncertainties: [] });
    await waitFor(() => expect(sessionState.addAskMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: 'Please specify the governing ruleset.',
    })));
  });

  it('ignores a stream that resolves after the conversation is cleared', async () => {
    mockIsAskStreamingSupported.mockReturnValue(true);
    let resolveOldStream!: (value: unknown) => void;
    let firstHandlers: any;
    mockStreamAskChat.mockImplementationOnce((...args: any[]) => {
      firstHandlers = args[5];
      return new Promise((resolve) => {
        resolveOldStream = resolve;
      });
    });

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));
    await waitFor(() => expect(firstHandlers).toBeDefined());

    sessionState.setAskStreamingAssistant.mockClear();
    sessionState.setAskLoading.mockClear();
    fireEvent.click(screen.getByTestId('ask-clear'));
    expect(sessionState.clearAskMessages).toHaveBeenCalled();
    expect(sessionState.setAskStreamingAssistant).toHaveBeenCalledWith(null);
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(false);

    sessionState.setAskStreamingAssistant.mockClear();
    sessionState.setAskLoading.mockClear();
    resolveOldStream({ response: 'stale response', followUpQuestions: [], uncertainties: [] });
    await drainAsyncWork();

    expect(sessionState.addAskMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: 'stale response',
    }));
    expect(sessionState.appendAskStreamingDelta).not.toHaveBeenCalled();
    expect(sessionState.setAskStreamingAssistant).not.toHaveBeenCalledWith(null);
    expect(sessionState.setAskLoading).not.toHaveBeenCalledWith(false);
  });

  it('ignores a stream that resolves after a saved chat is loaded', async () => {
    mockIsAskStreamingSupported.mockReturnValue(true);
    let resolveOldStream!: (value: unknown) => void;
    let firstHandlers: any;
    mockStreamAskChat.mockImplementationOnce((...args: any[]) => {
      firstHandlers = args[5];
      return new Promise((resolve) => {
        resolveOldStream = resolve;
      });
    });

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));
    await waitFor(() => expect(firstHandlers).toBeDefined());

    sessionState.setAskStreamingAssistant.mockClear();
    sessionState.setAskLoading.mockClear();
    fireEvent.click(screen.getByTestId('ask-load-chat'));
    expect(sessionState.loadSavedChat).toHaveBeenCalledWith('saved-chat');
    expect(sessionState.setAskStreamingAssistant).toHaveBeenCalledWith(null);
    expect(sessionState.setAskLoading).toHaveBeenCalledWith(false);

    sessionState.setAskStreamingAssistant.mockClear();
    sessionState.setAskLoading.mockClear();
    resolveOldStream({ response: 'stale response', followUpQuestions: [], uncertainties: [] });
    await drainAsyncWork();

    expect(sessionState.addAskMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: 'stale response',
    }));
    expect(sessionState.appendAskStreamingDelta).not.toHaveBeenCalled();
    expect(sessionState.setAskStreamingAssistant).not.toHaveBeenCalledWith(null);
    expect(sessionState.setAskLoading).not.toHaveBeenCalledWith(false);
  });

  it('does not write stale stream results after AskPage unmounts', async () => {
    mockIsAskStreamingSupported.mockReturnValue(true);
    let resolveOldStream!: (value: unknown) => void;
    let firstHandlers: any;
    mockStreamAskChat.mockImplementationOnce((...args: any[]) => {
      firstHandlers = args[5];
      return new Promise((resolve) => {
        resolveOldStream = resolve;
      });
    });

    const { unmount } = render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-send'));
    await waitFor(() => expect(firstHandlers).toBeDefined());

    sessionState.addAskMessage.mockClear();
    sessionState.appendAskStreamingDelta.mockClear();
    sessionState.setAskStreamingAssistant.mockClear();
    sessionState.setAskLoading.mockClear();
    unmount();

    expect(sessionState.setAskStreamingAssistant).not.toHaveBeenCalled();
    expect(sessionState.setAskLoading).not.toHaveBeenCalled();

    resolveOldStream({ response: 'stale response', followUpQuestions: [], uncertainties: [] });
    await drainAsyncWork();

    expect(sessionState.addAskMessage).not.toHaveBeenCalled();
    expect(sessionState.appendAskStreamingDelta).not.toHaveBeenCalled();
    expect(sessionState.setAskStreamingAssistant).not.toHaveBeenCalled();
    expect(sessionState.setAskLoading).not.toHaveBeenCalled();
  });

  it('AskPage reports a rejected chat save instead of confirming success', async () => {
    sessionState.askMessages = [{ content: 'Chat to save' }];
    sessionState.saveCurrentChat.mockRejectedValueOnce(new Error('save failed'));

    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-save-chat'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Chat Saved' }));
  });

  it('AskPage saves source to library', () => {
    render(
      <BrowserRouter>
        <AskPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('ask-save'));

    expect(sessionState.addSource).toHaveBeenCalledWith({ title: 'Saved Title', content: 'Saved Content', type: 'text', folder: 'Ask' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved' }));
  });

  it('BrainstormPage submits and stores brainstorm results', async () => {
    mockBrainstorm.mockResolvedValueOnce({ result: { needsMoreInfo: false, nextSteps: ['A'], warningsAndTradeoffs: [] }, discoveredSources: [] });

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
    const factoidsResult: FactoidsOutput = { factoids: [], searchSuggestions: [], warnings: [], verificationStatus: 'complete' };
    mockFactoids.mockResolvedValueOnce({ result: factoidsResult, discoveredSources: [{ title: 'Consulted source', url: 'https://example.com' }] });

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
    expect(sessionState.setFactoidsResult).toHaveBeenCalledWith(factoidsResult);
    expect(screen.getByTestId('factoids-source-count')).toHaveTextContent('1');
    expect(sessionState.setFactoidsLoading).toHaveBeenCalledWith(false);
  });

  it('FactoidsPage clears and replaces consulted sources for each request', async () => {
    const factoidsResult: FactoidsOutput = { factoids: [], searchSuggestions: [], warnings: [], verificationStatus: 'complete' };
    mockFactoids
      .mockResolvedValueOnce({ result: factoidsResult, discoveredSources: [{ title: 'First source', url: 'https://example.com/first' }] })
      .mockResolvedValueOnce({ result: factoidsResult, discoveredSources: [] });

    render(
      <BrowserRouter>
        <FactoidsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByTestId('factoids-submit'));
    await waitFor(() => expect(screen.getByTestId('factoids-source-count')).toHaveTextContent('1'));

    fireEvent.click(screen.getByTestId('factoids-submit'));
    await waitFor(() => expect(screen.getByTestId('factoids-source-count')).toHaveTextContent('0'));
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

  it('FactoidsPage saves selected evidence to source library', async () => {
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

    await waitFor(() => {
      expect(sessionState.addSource).toHaveBeenCalledWith({
        title: 'Fact source',
        content: 'Fact content',
        type: 'url',
        origin: 'https://example.com',
        folder: 'Factoids',
      });
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved to Library' }));
    });
  });
});
