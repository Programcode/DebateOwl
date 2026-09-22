import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'user-a',
  crossfire: vi.fn<() => Promise<unknown>>(() => new Promise(() => undefined)),
  crossfireSignal: vi.fn<(input: unknown, config: unknown, options: { signal?: AbortSignal }) => Promise<unknown>>(() => Promise.resolve(undefined)),
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
  crossfireSignal: mocks.crossfireSignal,
  isTimeoutError: () => false,
}));

import CrossfirePage from '@/pages/CrossfirePage';
import { createCrossfireSetupState } from '@/lib/crossfire/reducer';
import { loadCrossfireDraft, saveCrossfireDraft } from '@/lib/crossfire/storage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/crossfire']}>
      <CrossfirePage />
    </MemoryRouter>,
  );
}

describe('CrossfirePage', () => {
  beforeEach(() => {
    mocks.userId = 'user-a';
    mocks.crossfire.mockReset();
    mocks.crossfire.mockImplementation(() => new Promise(() => undefined));
    mocks.crossfireSignal.mockReset();
    mocks.crossfireSignal.mockResolvedValue(undefined);
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

    const userBDraft = createCrossfireSetupState({
      resolution: 'Resolved: preserve B',
      argument: 'Account B saved case',
    });
    expect(saveCrossfireDraft('user-b', userBDraft, window.localStorage, 10)).toBe(true);
    setItemSpy.mockClear();
    mocks.userId = 'user-b';
    view.rerender(
      <MemoryRouter initialEntries={['/app/crossfire']}>
        <CrossfirePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('crossfire-resolution')).toHaveValue('Resolved: preserve B'));
    expect(screen.queryByText('What is the mechanism?')).not.toBeInTheDocument();
    expect(screen.getByTestId('crossfire-argument')).toHaveValue('Account B saved case');
    const writesForUserB = setItemSpy.mock.calls.filter(([key]) => key === 'debatelab-crossfire-draft:user-b');
    expect(writesForUserB.every(([, value]) => !value.includes('What is the mechanism?'))).toBe(true);
    expect(loadCrossfireDraft('user-b', window.localStorage)).toEqual(userBDraft);
    setItemSpy.mockRestore();
  });

  it('moves an unexpected next-turn variant into the retry state', async () => {
    mocks.crossfire.mockResolvedValueOnce({
      concessionsSecured: [],
      controlledQuestions: [],
      weakOrRepetitiveQuestions: [],
      evasiveOrIncompleteAnswers: [],
      missedFollowUps: [],
      betterFollowUpQuestions: [],
      strongestExchange: null,
    });
    renderPage();
    fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
    fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
    fireEvent.click(screen.getByTestId('start-crossfire'));
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'What is the mechanism?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));

    expect(await screen.findByTestId('retry-ai')).toBeInTheDocument();
    expect(screen.getByText('The coach returned an incomplete response. Try again to continue.')).toBeInTheDocument();
  });

  it('moves an unexpected debrief variant into the retry state', async () => {
    mocks.crossfire
      .mockResolvedValueOnce({ type: 'answer', text: 'A bounded answer.' })
      .mockResolvedValueOnce({ type: 'question', text: 'Not a debrief.' });
    renderPage();
    fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
    fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
    fireEvent.click(screen.getByTestId('start-crossfire'));
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'What is the mechanism?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    expect(await screen.findByText('A bounded answer.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('end-crossfire'));

    expect(await screen.findByTestId('retry-debrief')).toBeInTheDocument();
    expect(screen.getByText('The coach returned an incomplete debrief. Try again to continue.')).toBeInTheDocument();
  });

  it('shows live coaching on the answer only', async () => {
    mocks.crossfire.mockResolvedValueOnce({
      type: 'answer',
      text: 'A bounded answer.',
      signalToken: 'token',
    });
    mocks.crossfireSignal.mockResolvedValueOnce({ answerTurnId: 'T2', answerQuality: 'direct', answerQualityConfidence: 0.91, concession: 'implicit', concessionConfidence: 0.74, followUpOpportunity: 0.82 });
    renderPage();
    fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
    fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
    fireEvent.click(screen.getByTestId('start-crossfire'));
    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'What is the mechanism?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));

    const answer = await screen.findByText('A bounded answer.');
    expect(answer.closest('article')).toHaveTextContent('Direct answer');
    expect(answer.closest('article')).toHaveTextContent('Implicit concession');
    expect(answer.closest('article')).toHaveTextContent('Follow-up opportunity');
    expect(screen.getByText('What is the mechanism?').closest('article')).not.toHaveTextContent('Direct answer');
    expect(answer.closest('article')?.querySelector('[aria-label*="82%"]')).not.toBeNull();
  });

  it('keeps a delayed coaching signal alive while the next turn runs', async () => {
    let resolveSignal: (value: unknown) => void = () => undefined;
    let sidecarSignal: AbortSignal | undefined;
    mocks.crossfire
      .mockResolvedValueOnce({ type: 'answer', text: 'First bounded answer.', signalToken: 'token-1' })
      .mockResolvedValueOnce({ type: 'answer', text: 'Second bounded answer.' });
    mocks.crossfireSignal.mockImplementationOnce((_input, _config, options) => {
      sidecarSignal = options.signal;
      return new Promise((resolve) => {
        resolveSignal = resolve;
      });
    });
    renderPage();
    fireEvent.change(screen.getByTestId('crossfire-resolution'), { target: { value: 'Resolved: test' } });
    fireEvent.change(screen.getByTestId('crossfire-argument'), { target: { value: 'Case text' } });
    fireEvent.click(screen.getByTestId('start-crossfire'));

    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'First question?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    const firstAnswer = await screen.findByText('First bounded answer.');

    fireEvent.change(screen.getByTestId('crossfire-input'), { target: { value: 'Second question?' } });
    fireEvent.click(screen.getByTestId('submit-turn'));
    expect(await screen.findByText('Second bounded answer.')).toBeInTheDocument();
    expect(sidecarSignal?.aborted).toBe(false);

    resolveSignal({ answerTurnId: 'T2', answerQuality: 'direct', answerQualityConfidence: 0.91, concession: 'none', concessionConfidence: 0.88, followUpOpportunity: 0.76 });
    await waitFor(() => expect(firstAnswer.closest('article')).toHaveTextContent('Direct answer'));
  });
});
