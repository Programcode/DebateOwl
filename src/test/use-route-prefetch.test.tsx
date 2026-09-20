import { act, fireEvent, render, screen } from '@testing-library/react';
import type { To } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoutePrefetch } from '@/hooks/use-route-prefetch';

const { mockPreloadRoute } = vi.hoisted(() => ({
  mockPreloadRoute: vi.fn(),
}));

vi.mock('@/lib/route-modules', () => ({
  preloadRoute: mockPreloadRoute,
  routeLoaders: {
    '/app/attack': vi.fn(),
  },
}));

function TestLink({ to }: { to: To }) {
  const intentHandlers = useRoutePrefetch(to);
  return (
    <a href={typeof to === 'string' ? to : '#'} {...intentHandlers}>
      Destination
    </a>
  );
}

function setConnection(connection: { saveData?: boolean; effectiveType?: string } | undefined) {
  if (connection) {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: connection,
    });
    return;
  }

  Reflect.deleteProperty(navigator, 'connection');
}

describe('useRoutePrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPreloadRoute.mockReset();
    setConnection(undefined);
  });

  afterEach(() => {
    setConnection(undefined);
    vi.useRealTimers();
  });

  it('waits briefly before prefetching on hover', () => {
    render(<TestLink to="/app/attack" />);

    fireEvent.pointerEnter(screen.getByRole('link'));
    expect(mockPreloadRoute).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(99));
    expect(mockPreloadRoute).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(mockPreloadRoute).toHaveBeenCalledWith('/app/attack');
  });

  it('cancels a hover prefetch when the pointer leaves first', () => {
    render(<TestLink to="/app/attack" />);
    const link = screen.getByRole('link');

    fireEvent.pointerEnter(link);
    fireEvent.pointerLeave(link);
    act(() => vi.advanceTimersByTime(100));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });

  it('waits briefly before prefetching on keyboard focus', () => {
    render(<TestLink to="/app/attack" />);

    fireEvent.focus(screen.getByRole('link'));
    act(() => vi.advanceTimersByTime(100));

    expect(mockPreloadRoute).toHaveBeenCalledWith('/app/attack');
  });

  it('prefetches immediately on pointer-down intent', () => {
    render(<TestLink to="/app/attack" />);

    fireEvent.pointerDown(screen.getByRole('link'), { pointerType: 'touch' });

    expect(mockPreloadRoute).toHaveBeenCalledWith('/app/attack');
  });

  it('deduplicates repeated intent signals for one destination', () => {
    render(<TestLink to="/app/attack" />);
    const link = screen.getByRole('link');

    fireEvent.pointerEnter(link);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.focus(link);
    fireEvent.pointerDown(link);

    expect(mockPreloadRoute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Save-Data', { saveData: true }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['2g', { effectiveType: '2g' }],
  ])('skips prefetch for %s connections', (_label, connection) => {
    setConnection(connection);
    render(<TestLink to="/app/attack" />);

    fireEvent.pointerDown(screen.getByRole('link'));
    act(() => vi.advanceTimersByTime(100));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });

  it.each([
    ['3g', { effectiveType: '3g' }],
    ['missing Network Information', undefined],
  ])('allows prefetch for %s connections', (_label, connection) => {
    setConnection(connection);
    render(<TestLink to="/app/attack" />);

    fireEvent.pointerDown(screen.getByRole('link'));

    expect(mockPreloadRoute).toHaveBeenCalledWith('/app/attack');
  });

  it('ignores unknown and external URLs', () => {
    const { rerender } = render(<TestLink to="/app/not-a-route" />);

    fireEvent.pointerDown(screen.getByRole('link'));
    rerender(<TestLink to="https://example.com/app/attack" />);
    fireEvent.pointerDown(screen.getByRole('link'));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });

  it('cleans up a pending timer on unmount', () => {
    const { unmount } = render(<TestLink to="/app/attack" />);
    fireEvent.pointerEnter(screen.getByRole('link'));

    unmount();
    act(() => vi.advanceTimersByTime(100));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });
});
