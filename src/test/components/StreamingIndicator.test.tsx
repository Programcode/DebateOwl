import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import i18n from '@/i18n';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

describe('StreamingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  const messages = ['Analyzing...', 'Generating...', 'Almost done...'];

  it('renders first message', () => {
    render(<StreamingIndicator messages={messages} />);
    expect(screen.getByText('Analyzing...')).toBeDefined();
  });

  it('cycles to second message after interval', () => {
    render(<StreamingIndicator messages={messages} intervalMs={3000} />);
    act(() => { vi.advanceTimersByTime(3200); });
    expect(screen.getByText('Generating...')).toBeDefined();
  });

  it('cycles to third message', () => {
    render(<StreamingIndicator messages={messages} intervalMs={3000} />);
    act(() => { vi.advanceTimersByTime(6400); });
    expect(screen.getByText('Almost done...')).toBeDefined();
  });

  it('wraps around to first message', () => {
    render(<StreamingIndicator messages={messages} intervalMs={3000} />);
    act(() => { vi.advanceTimersByTime(9600); });
    expect(screen.getByText('Analyzing...')).toBeDefined();
  });

  it('shows progress bar', () => {
    const { container } = render(<StreamingIndicator messages={messages} />);
    const progressBar = container.querySelector('.bg-primary\\/60');
    expect(progressBar).not.toBeNull();
  });

  it('progress bar starts at 0%', () => {
    const { container } = render(<StreamingIndicator messages={messages} />);
    const progressBar = container.querySelector('.bg-primary\\/60') as HTMLElement;
    expect(progressBar.style.width).toBe('0%');
  });

  it('progress bar increases over time', () => {
    const { container } = render(<StreamingIndicator messages={messages} intervalMs={3000} />);
    act(() => { vi.advanceTimersByTime(1500); });
    const progressBar = container.querySelector('.bg-primary\\/60') as HTMLElement;
    const width = parseFloat(progressBar.style.width);
    expect(width).toBeGreaterThan(0);
  });

  it('accepts custom interval', () => {
    render(<StreamingIndicator messages={messages} intervalMs={1000} />);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(screen.getByText('Generating...')).toBeDefined();
  });

  it('applies custom className', () => {
    const { container } = render(<StreamingIndicator messages={messages} className="custom-class" />);
    expect(container.querySelector('.custom-class')).not.toBeNull();
  });

  it('renders with single message', () => {
    render(<StreamingIndicator messages={['Loading...']} />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('localizes loading and overlay close controls after a runtime language switch', async () => {
    await act(async () => { await i18n.changeLanguage('hu'); });
    const indicator = render(<StreamingIndicator messages={['Elemzés...']} />);
    expect(screen.getByRole('status', { name: 'Betöltés' })).toBeInTheDocument();
    indicator.unmount();

    const dialog = render(<Dialog open><DialogContent><DialogTitle>Tesztpárbeszéd</DialogTitle></DialogContent></Dialog>);
    expect(screen.getByRole('button', { name: 'Bezárás' })).toBeInTheDocument();
    dialog.unmount();

    render(<Sheet open><SheetContent><SheetTitle>Tesztpanel</SheetTitle></SheetContent></Sheet>);
    expect(screen.getByRole('button', { name: 'Bezárás' })).toBeInTheDocument();
  });
});
