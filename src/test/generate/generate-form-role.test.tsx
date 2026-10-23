import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateForm } from '@/components/features/generate/GenerateForm';
import { useSessionStore } from '@/lib/stores/session-store';
import { resetDebates, seedCurrentDebate } from '@/test/helpers/debate';

// MD-06: a debate started with "Any role" carries that role into Generate, and the
// form still submits with it.

vi.mock('@/components/ModelSelector', () => ({ ModelSelector: (): null => null }));
vi.mock('@/components/features/debate/DebateContextControl', () => ({ DebateContextControl: (): null => null }));

describe('GenerateForm role from the Current Debate', () => {
  beforeEach(() => {
    resetDebates();
    useSessionStore.setState({ generateForm: {} });
  });

  it('shows Any role and submits it when the debate was started with any role', async () => {
    seedCurrentDebate({ settings: { role: 'general' } });
    const onSubmit = vi.fn();
    render(<GenerateForm onSubmit={onSubmit} isLoading={false} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Motion/ })).toHaveValue('This House would make public transport free'));
    expect(screen.getByRole('combobox', { name: 'Speaker Role' })).toHaveTextContent('Any role');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Debate Case' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ motion: 'This House would make public transport free', role: 'general' });
  });
});
