import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'user-a',
  crossfire: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (state: { sourceLibrary: unknown[] }) => unknown) => selector({ sourceLibrary: [] }),
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: () => ({
    getFeatureConfig: () => ({ provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 }),
  }),
}));

vi.mock('@/lib/ai/client', () => ({
  AIResponseError: class AIResponseError extends Error {},
  crossfire: mocks.crossfire,
  isTimeoutError: () => false,
}));

import CrossfirePage from '@/pages/CrossfirePage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/crossfire']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CrossfirePage />
    </MemoryRouter>,
  );
}

describe('CrossfirePage', () => {
  beforeEach(() => {
    mocks.userId = 'user-a';
    mocks.crossfire.mockClear();
    localStorage.clear();
  });

  it('supports arrow-key radio navigation', () => {
    renderPage();
    const questionAi = screen.getByTestId('mode-question-ai');
    const aiQuestionsUser = screen.getByTestId('mode-ai-questions-user');
    questionAi.focus();
    fireEvent.keyDown(questionAi, { key: 'ArrowRight' });
    expect(aiQuestionsUser).toHaveAttribute('aria-checked', 'true');
    expect(aiQuestionsUser).toHaveFocus();

    const cooperative = screen.getByTestId('style-cooperative');
    cooperative.focus();
    fireEvent.keyDown(cooperative, { key: 'End' });
    expect(screen.getByTestId('style-aggressive')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('style-aggressive')).toHaveFocus();
  });

  it('resets a mounted transcript when the authenticated account changes', async () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const view = renderPage();
    fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
    fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
    fireEvent.click(screen.getByTestId('start-crossfire'));
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'What is the mechanism?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    expect(screen.getByText('What is the mechanism?')).toBeInTheDocument();

    setItemSpy.mockClear();
    mocks.userId = 'user-b';
    view.rerender(
      <MemoryRouter initialEntries={['/app/crossfire']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CrossfirePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('crossfire-resolution')).toHaveValue(''));
    expect(screen.queryByText('What is the mechanism?')).not.toBeInTheDocument();
    expect(screen.getByTestId('crossfire-argument')).toHaveValue('');
    const writesForUserB = setItemSpy.mock.calls.filter(([key]) => key === 'debatelab-crossfire-draft:user-b');
    expect(writesForUserB.every(([, value]) => !value.includes('What is the mechanism?'))).toBe(true);
    setItemSpy.mockRestore();
  });
});
