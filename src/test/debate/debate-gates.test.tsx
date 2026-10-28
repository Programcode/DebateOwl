import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetMockState, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', async () => ({ supabase: (await import('@/test/mocks/supabase')).supabaseMock }));

import i18n from '@/i18n';
import { InactiveDebateGate } from '@/components/features/debate/DebateDialogs';
import { useDebateMotionGate, type DebateTarget } from '@/components/features/debate/DebateMotionGate';
import { INACTIVE_DEBATE_MS, useDebateStore } from '@/lib/stores/debate-store';
import { resetDebates, seedCurrentDebate } from '@/test/helpers/debate';

const DAY = 24 * 60 * 60 * 1000;

describe('five-day Current Debate gate', () => {
  beforeEach(async () => {
    resetMockState();
    await i18n.changeLanguage('en');
  });
  afterEach(() => resetDebates());

  const renderGate = () => render(<MemoryRouter><InactiveDebateGate /></MemoryRouter>);

  it('blocks the app after five days without meaningful work, offering only Continue, Start new, or Switch', () => {
    seedCurrentDebate({ motion: 'This House would ban homework', lastActivityAt: Date.now() - INACTIVE_DEBATE_MS - DAY });
    renderGate();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Still preparing this debate?');
    expect(dialog).toHaveTextContent('This House would ban homework');
    const buttons = Array.from(dialog.querySelectorAll('button')).map((button) => button.textContent);
    expect(buttons).toEqual(['Switch debate', 'Start new debate', 'Continue']);
  });

  it('treats Escape as Continue, so the gate never traps the user', async () => {
    seedCurrentDebate({ lastActivityAt: Date.now() - 6 * DAY });
    renderGate();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(Date.now() - useDebateStore.getState().debates[0].lastActivityAt).toBeLessThan(1000);
  });

  it('stays out of the way before five days and before the server state loads', () => {
    seedCurrentDebate({ lastActivityAt: Date.now() - 4 * DAY });
    const { unmount } = renderGate();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();

    seedCurrentDebate({ lastActivityAt: Date.now() - 6 * DAY });
    useDebateStore.setState({ hydrated: false });
    renderGate();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Continue resets the inactivity clock on the server and closes the gate', async () => {
    seedCurrentDebate({ lastActivityAt: Date.now() - 6 * DAY });
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(supabaseMock.from).toHaveBeenCalledWith('debates');
    expect(Date.now() - useDebateStore.getState().debates[0].lastActivityAt).toBeLessThan(1000);
  });

  it('marks a failed debate load so Home stops showing it as loading', async () => {
    const failing = () => ({
      select: () => ({
        order: async () => ({ data: null as unknown, error: { message: 'unavailable' } }),
        maybeSingle: async () => ({ data: null as unknown, error: null as unknown }),
      }),
    }) as unknown as ReturnType<typeof supabaseMock.from>;
    supabaseMock.from.mockImplementationOnce(failing).mockImplementationOnce(failing);
    useDebateStore.setState({ hydrated: false, loadFailed: false });
    await useDebateStore.getState().hydrate();
    expect(useDebateStore.getState()).toMatchObject({ hydrated: false, loadFailed: true });
  });
});

function GateHarness({ motion, onTarget }: { motion: string; onTarget: (target: DebateTarget) => void }) {
  const gate = useDebateMotionGate();
  return (
    <>
      <button type="button" onClick={() => gate.run(motion, onTarget)}>Submit</button>
      {gate.dialog}
    </>
  );
}

describe('motion mismatch choice', () => {
  beforeEach(async () => {
    resetMockState();
    await i18n.changeLanguage('en');
  });
  afterEach(() => resetDebates());

  it('proceeds immediately into the Current Debate when the motion matches', () => {
    const debate = seedCurrentDebate({ motion: 'This House would ban homework' });
    const onTarget = vi.fn();
    render(<GateHarness motion="this house would ban homework" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onTarget).toHaveBeenCalledWith({ debateId: debate.id });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before a different motion and runs it once without a debate when chosen', () => {
    seedCurrentDebate({ motion: 'This House would ban homework' });
    const onTarget = vi.fn();
    render(<GateHarness motion="This House would abolish zoos" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onTarget).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('This is a different motion');
    expect(screen.queryByRole('button', { name: 'Switch to this existing debate' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use once without saving to a debate' }));
    expect(onTarget).toHaveBeenCalledWith({ debateId: null });
    // The Current Debate did not change.
    expect(useDebateStore.getState().debates).toHaveLength(1);
  });

  it('switches to an existing debate with the same motion', async () => {
    const homework = seedCurrentDebate({ motion: 'This House would ban homework' });
    const zoos = { ...homework, id: '22222222-2222-4222-8222-222222222222', motion: 'This House would abolish zoos' };
    useDebateStore.setState({ debates: [homework, zoos] });
    const onTarget = vi.fn();
    render(<GateHarness motion="This House would abolish zoos" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to this existing debate' }));
    await waitFor(() => expect(onTarget).toHaveBeenCalledWith({ debateId: zoos.id }));
    expect(useDebateStore.getState().currentDebateId).toBe(zoos.id);
  });

  it('creates a new Current Debate from the motion', async () => {
    seedCurrentDebate({ motion: 'This House would ban homework' });
    supabaseMock.from.mockImplementationOnce(() => ({
      insert: () => ({ select: () => ({ single: async () => ({
        data: { id: 'new-debate', motion: 'This House would abolish zoos', settings: {}, instructions: '', last_activity_at: new Date().toISOString(), created_at: new Date().toISOString() },
        error: null as unknown,
      }) }) }),
    }) as unknown as ReturnType<typeof supabaseMock.from>);
    const onTarget = vi.fn();
    render(<GateHarness motion="This House would abolish zoos" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create a new debate for this motion' }));
    });
    await waitFor(() => expect(onTarget).toHaveBeenCalledWith({ debateId: 'new-debate' }));
    expect(useDebateStore.getState().currentDebateId).toBe('new-debate');
    expect(useDebateStore.getState().debates.map((debate) => debate.motion)).toContain('This House would ban homework');
  });

  const mockCreatedDebate = (id: string, motion: string) => {
    supabaseMock.from.mockImplementationOnce(() => ({
      insert: () => ({ select: () => ({ single: async () => ({
        data: { id, motion, settings: {}, instructions: '', last_activity_at: new Date().toISOString(), created_at: new Date().toISOString() },
        error: null as unknown,
      }) }) }),
    }) as unknown as ReturnType<typeof supabaseMock.from>);
  };

  it('offers a first debate instead of the switch choice when there is no Current Debate', async () => {
    mockCreatedDebate('first-debate', 'This House would abolish zoos');
    const onTarget = vi.fn();
    render(<GateHarness motion="This House would abolish zoos" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onTarget).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Start a debate with this motion?' });
    expect(dialog).toHaveTextContent('This House would abolish zoos');
    expect(dialog).not.toHaveTextContent('different motion');
    const buttons = Array.from(dialog.querySelectorAll('button')).map((button) => button.textContent).filter((text) => text !== 'Close');
    expect(buttons).toEqual(['Start debate', 'Not now, use it once']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start debate' }));
    });
    await waitFor(() => expect(onTarget).toHaveBeenCalledWith({ debateId: 'first-debate' }));
    expect(useDebateStore.getState().currentDebateId).toBe('first-debate');
  });

  it('lets a user with no Current Debate decline the offer and run the motion once', () => {
    const onTarget = vi.fn();
    render(<GateHarness motion="This House would abolish zoos" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now, use it once' }));
    expect(onTarget).toHaveBeenCalledWith({ debateId: null });
    expect(useDebateStore.getState().debates).toHaveLength(0);
  });

  it('still offers an existing debate with the same motion when none is current', async () => {
    const zoos = seedCurrentDebate({ motion: 'This House would abolish zoos' });
    useDebateStore.setState({ currentDebateId: null });
    const onTarget = vi.fn();
    render(<GateHarness motion="this house would abolish zoos" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('dialog', { name: 'Start a debate with this motion?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to this existing debate' }));
    await waitFor(() => expect(onTarget).toHaveBeenCalledWith({ debateId: zoos.id }));
  });

  it('does nothing when the user dismisses the choice', () => {
    seedCurrentDebate({ motion: 'This House would ban homework' });
    const onTarget = vi.fn();
    render(<GateHarness motion="Other motion" onTarget={onTarget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onTarget).not.toHaveBeenCalled();
  });
});
