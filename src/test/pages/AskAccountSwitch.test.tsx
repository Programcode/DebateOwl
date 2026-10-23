import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LiveGeneration } from '@/lib/ai/client';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), writable: true });

const mocks = vi.hoisted(() => ({
  userId: 'user-a',
  live: undefined as LiveGeneration | undefined,
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));

// A structured Ask that keeps writing until the test is done with it.
vi.mock('@/lib/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/client')>()),
  askChat: vi.fn((_message: string, _history: unknown, _mode: string, _config: unknown, options: { live?: LiveGeneration }) => {
    mocks.live = options.live;
    return new Promise(() => {});
  }),
}));

vi.mock('@/components/features/subscription', () => ({
  LimitReachedModal: (): null => null,
  ModelRestrictedModal: (): null => null,
  PricingModal: (): null => null,
}));

vi.mock('@/lib/ai/streaming', () => ({
  isAskStreamingSupported: () => false,
  streamAskChat: vi.fn(),
}));

import AskPage from '@/pages/AskPage';
import { useSessionStore } from '@/lib/stores/session-store';
import { enableOneOffMode } from '@/test/helpers/debate';

describe('Ask across an account change', () => {
  it('never shows the previous account\'s answer as it is written', async () => {
    enableOneOffMode();
    const view = render(<MemoryRouter initialEntries={['/app/ask']}><AskPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message to your debate coach' }), { target: { value: 'How do I weigh cost?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(mocks.live).toBeDefined());

    act(() => mocks.live!.onDraft({ response: 'Account A private answer' }));
    expect(screen.getByText('Account A private answer')).toBeInTheDocument();

    // Account B replaces A in this tab; the auth reset clears A's chat.
    act(() => {
      useSessionStore.getState().resetLocalData();
      mocks.userId = 'user-b';
    });
    view.rerender(<MemoryRouter initialEntries={['/app/ask']}><AskPage /></MemoryRouter>);

    // A's request is still answering.
    act(() => mocks.live!.onDraft({ response: 'Account A private answer, continued' }));
    expect(screen.queryByText(/Account A private answer/)).not.toBeInTheDocument();
    expect(useSessionStore.getState().askStreamingAssistant).toBeNull();
  });

  it('does not stay on Typing after you leave mid-answer', async () => {
    mocks.userId = 'user-a';
    enableOneOffMode();
    useSessionStore.getState().clearAskMessages();
    const view = render(<MemoryRouter initialEntries={['/app/ask']}><AskPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message to your debate coach' }), { target: { value: 'How do I weigh cost?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(mocks.live).toBeDefined());
    act(() => mocks.live!.onDraft({ response: 'A partial answer' }));
    expect(useSessionStore.getState().askLoading).toBe(true);

    view.unmount();

    expect(useSessionStore.getState().askLoading).toBe(false);
    expect(useSessionStore.getState().askStreamingAssistant).toBeNull();
    expect(useSessionStore.getState().askMessages.map((message) => message.content)).toContain('A partial answer');
  });
});
