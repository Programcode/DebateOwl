import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SparringRound } from '@/components/features/sparring/SparringRound';
import { useSparringStore } from '@/lib/stores/sparring-store';

// A typed round opens on a ready step: the clock runs only once the student starts.

function renderRound() {
  const session = useSparringStore.getState().startSession({ motion: 'This house would make public transport free.', userSide: 'pro', format: 'standard', difficulty: 'medium' });
  const view = render(<SparringRound session={session} onSubmit={() => undefined} />);
  // Keep the rendered round in step with the store, as the page does.
  const rerender = () => view.rerender(<SparringRound session={useSparringStore.getState().currentSession!} onSubmit={() => undefined} />);
  return { rerender };
}

describe('SparringRound', () => {
  beforeEach(() => {
    useSparringStore.setState({ currentSession: null, savedSessions: [] });
  });

  it('waits for Start speaking before the clock runs', () => {
    const { rerender } = renderRound();
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(false);
    expect(screen.queryByRole('button', { name: 'Pause clock' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    rerender();
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(true);
    expect(screen.getByRole('button', { name: 'Pause clock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start speaking' })).not.toBeInTheDocument();
  });

  it('starts the clock on the first keystroke and labels the word counts', () => {
    const { rerender } = renderRound();
    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'One two three' } });
    rerender();
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(true);
    expect(screen.getByText('3 words')).toBeInTheDocument();
    expect(screen.getByText('0 words so far')).toBeInTheDocument();
  });

  it('returns a reset turn to its ready step, so the clock still covers the next speech', () => {
    const { rerender } = renderRound();
    fireEvent.click(screen.getByRole('button', { name: 'Start speaking' }));
    rerender();
    fireEvent.click(screen.getByRole('button', { name: 'Reset turn' }));
    rerender();
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(false);
    expect(screen.getByRole('button', { name: 'Start speaking' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /Draft for Pro Introductor/i }), { target: { value: 'Typed after the reset' } });
    rerender();
    expect(useSparringStore.getState().currentSession?.timerRunning).toBe(true);
  });

  it('says scoring stopped when the judge fails, and goes back to reading on a retry', () => {
    const session = useSparringStore.getState().startSession({ motion: 'This house would make public transport free.', userSide: 'pro', format: 'standard', difficulty: 'medium' });
    const round = (judgingError: string | null) => <SparringRound session={session} judging judgingError={judgingError} onSubmit={() => undefined} onRetryJudging={() => undefined} />;
    const view = render(round('The AI provider returned an unexpected error.'));
    expect(screen.getByText('Scoring stopped')).toBeInTheDocument();
    expect(screen.getByText('The judge could not finish scoring.')).toBeInTheDocument();
    expect(screen.queryByText('The judge is reading the transcript.')).not.toBeInTheDocument();
    expect(screen.queryByText('Round in progress')).not.toBeInTheDocument();

    // Try scoring again clears the error while the new request runs.
    view.rerender(round(null));
    expect(screen.getByText('The judge is reading the transcript.')).toBeInTheDocument();
    expect(screen.queryByText('Scoring stopped')).not.toBeInTheDocument();
  });

  it('does not nest a second main landmark inside the app layout', () => {
    renderRound();
    expect(document.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Current round' })).toBeInTheDocument();
  });
});
