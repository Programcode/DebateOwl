import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttackForm } from '@/components/features/attack/AttackForm';

const { mockSetAttackForm } = vi.hoisted(() => ({
  mockSetAttackForm: vi.fn(),
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: () => ({
    attackForm: {},
    setAttackForm: mockSetAttackForm,
  }),
}));

describe('AttackForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collapses attack options behind the options menu', () => {
    const onSubmit = vi.fn();
    const { container } = render(<AttackForm onSubmit={onSubmit} isLoading={false} />);

    const options = container.querySelector('#attack-options');
    const button = screen.getByRole('button', { name: /more options/i });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(options).toHaveAttribute('data-open', 'false');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(options).toHaveAttribute('data-open', 'true');
  });

  it('submits no mercy, logic-heavy, and both toggles on by default', async () => {
    const onSubmit = vi.fn();
    render(<AttackForm onSubmit={onSubmit} isLoading={false} />);

    fireEvent.change(screen.getByLabelText(/your argument/i), {
      target: { value: 'Their case has a weak link between uniqueness and impact.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /find weaknesses/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          aggressiveness: 'ruthless',
          judgeParadigm: 'logic',
          detectFallacies: true,
          analyzeWeighing: true,
        }),
        expect.anything()
      );
    });
  });
});
