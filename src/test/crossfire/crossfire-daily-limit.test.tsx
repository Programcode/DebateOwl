import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  crossfire: vi.fn<(input: { operation: string }) => Promise<unknown>>(),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
}));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (state: { sourceLibrary: unknown[] }) => unknown) => selector({ sourceLibrary: [] }),
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: () => ({
    getFeatureConfig: () => ({ provider: 'google', model: 'gemini-3-flash-preview' }),
    outputLanguage: 'en',
  }),
}));

vi.mock('@/lib/ai/client', async () => {
  const errors = await vi.importActual<typeof import('@/lib/ai/errors')>('@/lib/ai/errors');
  return {
    AIResponseError: errors.AIResponseError,
    AIProviderError: errors.AIProviderError,
    AISubscriptionError: errors.AISubscriptionError,
    isAISubscriptionError: errors.isAISubscriptionError,
    isAIModelRestrictionError: errors.isAIModelRestrictionError,
    crossfire: mocks.crossfire,
    crossfireSignal: vi.fn(() => Promise.resolve(undefined)),
    isTimeoutError: () => false,
  };
});

import CrossfirePage from '@/pages/CrossfirePage';
import { AISubscriptionError } from '@/lib/ai/client';
import { enableOneOffMode } from '@/test/helpers/debate';

function outOfRequests() {
  return new AISubscriptionError("You've used all 5 of your daily requests. Upgrade to Pro for 50 daily requests.", {
    statusCode: 402,
    code: 'limit_reached',
    limit: 5,
    current: 5,
  });
}

function startRound(mode: 'question-ai' | 'ai-questions-user') {
  render(<MemoryRouter initialEntries={['/app/crossfire']}><CrossfirePage /></MemoryRouter>);
  fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
  fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
  fireEvent.click(screen.getByTestId(`mode-${mode}`));
  fireEvent.click(screen.getByTestId('start-crossfire'));
}

describe('Crossfire out of daily requests', () => {
  beforeEach(() => {
    enableOneOffMode();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does not start the round or its clock when the first AI turn is refused, and opens the daily-limit dialog', async () => {
    mocks.crossfire.mockRejectedValueOnce(outOfRequests());
    startRound('ai-questions-user');

    expect(await screen.findByRole('dialog')).toHaveTextContent('5 of 5');
    expect(screen.queryByTestId('end-crossfire')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-crossfire')).toBeInTheDocument();
    expect(screen.getByTestId('crossfire-resolution')).toHaveValue('Resolved: test');
  });

  it('keeps a round that already has an exchange, so it can still be ended and debriefed', async () => {
    mocks.crossfire
      .mockResolvedValueOnce({ type: 'question', text: 'Who pays the cost?' })
      .mockRejectedValueOnce(outOfRequests());
    startRound('ai-questions-user');

    fireEvent.change(await screen.findByTestId('crossfire-input'), { target: { value: 'The travellers do.' } });
    fireEvent.click(screen.getByTestId('submit-turn'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // Inline too, in the dialog's words rather than the server's English.
    // The open dialog hides the page from the accessibility tree.
    const inline = screen.getAllByRole('alert', { hidden: true }).find((alert) => alert.textContent?.includes('5 of 5 included AI uses'));
    expect(inline).toBeDefined();
    expect(screen.queryByText(/Upgrade to Pro for 50 daily requests/)).not.toBeInTheDocument();
    expect(screen.getByTestId('end-crossfire')).toBeEnabled();
  });

  it('lets a round with no exchange be ended by hand without an error', async () => {
    mocks.crossfire.mockImplementation(() => new Promise(() => undefined));
    startRound('ai-questions-user');

    fireEvent.click(await screen.findByTestId('end-crossfire'));

    expect(screen.getByTestId('start-crossfire')).toBeInTheDocument();
    expect(screen.queryByText('Complete at least one exchange before ending the session.')).not.toBeInTheDocument();
  });
});
