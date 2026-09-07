import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SparringSetup } from '@/components/features/sparring/SparringSetup';

vi.mock('@/components/ModelSelector', () => ({
  ModelSelector: () => <div aria-label="Selected model">Local test model</div>,
}));

describe('SparringSetup', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('keeps format selection compact while exposing the selected timing summary', () => {
    render(<SparringSetup onStart={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Sparring' })).toBeInTheDocument();
    const format = screen.getByRole('combobox', { name: 'Round format' });
    expect(format).toHaveTextContent('School 4-6-6-3 · 8 speeches');
    expect(screen.getByText('About 38 minutes')).toBeInTheDocument();
    expect(screen.queryByText('8 speeches', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /School 4-6-6-3/ })).not.toBeInTheDocument();
  });

  it('keeps the request breakdown at the standard small text size', () => {
    render(<SparringSetup onStart={vi.fn()} />);

    expect(screen.getByText('4 replies + 1 judge')).toHaveClass('text-xs');
  });

  it('keeps the full speaking order available behind a native disclosure', () => {
    render(<SparringSetup onStart={vi.fn()} />);

    const summary = screen.getByText('Speaking order', { exact: true });
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('Pro Introductor')).toBeInTheDocument();

    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Pro Conclusor')).toBeVisible();
  });

  it('submits the selected side, pressure, and trimmed motion without changing the default format', () => {
    const onStart = vi.fn();
    render(<SparringSetup onStart={onStart} />);

    fireEvent.change(screen.getByLabelText('Motion'), { target: { value: '  This House would make public transport free.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Con' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ruthless' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }));

    expect(onStart).toHaveBeenCalledWith({
      motion: 'This House would make public transport free.',
      userSide: 'con',
      format: 'standard',
      difficulty: 'hard',
    });
  });

  it('keeps the start action and model control reachable in the compact sidebar', () => {
    render(<SparringSetup onStart={vi.fn()} />);

    expect(screen.getByLabelText('Selected model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled();
    expect(screen.getByLabelText('Motion').closest('form')).toHaveClass('items-start', 'lg:grid-cols-[minmax(0,1fr)_300px]');
  });
});
