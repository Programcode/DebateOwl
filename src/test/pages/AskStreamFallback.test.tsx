import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), writable: true });

const mocks = vi.hoisted(() => ({
  streamed: '',
  askChat: vi.fn(),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
}));

vi.mock('@/lib/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/client')>()),
  askChat: mocks.askChat,
}));

vi.mock('@/components/features/subscription', () => ({
  LimitReachedModal: (): null => null,
  ModelRestrictedModal: (): null => null,
  PricingModal: (): null => null,
}));

// The stream sends `mocks.streamed`, then fails the way ai-stream does when
// a reply is cut off at its cap before any real text.
vi.mock('@/lib/ai/streaming', () => ({
  isAskStreamingSupported: () => true,
  streamAskChat: vi.fn(async (_message: string, _history: unknown, _mode: string, _config: unknown, _options: unknown, handlers: { onDelta: (text: string) => void }) => {
    if (mocks.streamed) handlers.onDelta(mocks.streamed);
    throw new Error('AI streaming failed. Please try again.');
  }),
}));

import AskPage from '@/pages/AskPage';
import { useSessionStore } from '@/lib/stores/session-store';
import { enableOneOffMode } from '@/test/helpers/debate';

async function ask(streamed: string) {
  mocks.streamed = streamed;
  mocks.askChat.mockReset();
  mocks.askChat.mockResolvedValue({ response: 'Structured answer', followUpQuestions: [], uncertainties: [] });
  enableOneOffMode();
  useSessionStore.getState().clearAskMessages();
  render(<MemoryRouter initialEntries={['/app/ask']}><AskPage /></MemoryRouter>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Message to your debate coach' }), { target: { value: 'How do I weigh cost?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(useSessionStore.getState().askLoading).toBe(false));
}

describe('a failed Ask stream', () => {
  it('asks the structured endpoint when the stream sent only whitespace', async () => {
    await ask('\n\n');
    expect(mocks.askChat).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().askMessages.at(-1)?.content).toBe('Structured answer');
  });

  it('keeps a partial answer instead of asking again', async () => {
    await ask('Weigh access first');
    expect(mocks.askChat).not.toHaveBeenCalled();
    expect(useSessionStore.getState().askMessages.at(-1)?.content).toBe('Weigh access first');
  });
});
