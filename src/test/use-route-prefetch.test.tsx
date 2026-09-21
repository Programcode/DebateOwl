import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { To } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavLink } from '@/components/NavLink';
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

function IntentLink({ to }: { to: To }) {
  const intentHandlers = useRoutePrefetch(to);
  return (
    <a href={typeof to === 'string' ? to : '#'} {...intentHandlers}>
      Destination
    </a>
  );
}

function TestLink({ to }: { to: To }) {
  return (
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<IntentLink to={to} />} />
      </Routes>
    </MemoryRouter>
  );
}

type TestNavLinkHandlers = Pick<ComponentProps<typeof NavLink>, 'onPointerDown' | 'onPointerLeave' | 'onBlur'>;

function TestNavLink({ onPointerDown, onPointerLeave, onBlur }: TestNavLinkHandlers) {
  return (
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route
          path="/app"
          element={(
            <NavLink
              to="/app/attack"
              onPointerDown={onPointerDown}
              onPointerLeave={onPointerLeave}
              onBlur={onBlur}
            >
              Destination
            </NavLink>
          )}
        />
      </Routes>
    </MemoryRouter>
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

function mediaQuery(matches: boolean, media: string): MediaQueryList {
  return {
    matches,
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}

describe('useRoutePrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPreloadRoute.mockReset();
    setConnection(undefined);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => mediaQuery(true, query));
  });

  afterEach(() => {
    setConnection(undefined);
    vi.restoreAllMocks();
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

  it('ignores synthetic pointer hover on coarse touch screens', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => mediaQuery(false, query));
    render(<TestLink to="/app/attack" />);

    fireEvent.pointerEnter(screen.getByRole('link'), { pointerType: 'mouse' });
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

  it('resolves relative string destinations against the current route', () => {
    render(<TestLink to="attack" />);

    fireEvent.pointerDown(screen.getByRole('link'));

    expect(mockPreloadRoute).toHaveBeenCalledWith('/app/attack');
  });

  it('resolves relative object destinations against the current route', () => {
    render(<TestLink to={{ pathname: 'attack' }} />);

    fireEvent.pointerDown(screen.getByRole('link'));

    expect(mockPreloadRoute).toHaveBeenCalledWith('/app/attack');
  });

  it('uses the pathname for same-origin absolute destinations', () => {
    render(<TestLink to={`${window.location.origin}/app/attack`} />);

    fireEvent.pointerDown(screen.getByRole('link'));

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

  it('lets a consumer prevent pointer-down prefetch', () => {
    render(<TestNavLink onPointerDown={(event) => event.preventDefault()} />);

    fireEvent.pointerDown(screen.getByRole('link'));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });

  it('always cancels a pointer timer when the consumer prevents default', () => {
    render(<TestNavLink onPointerLeave={(event) => event.preventDefault()} />);
    const link = screen.getByRole('link');

    fireEvent.pointerEnter(link);
    fireEvent.pointerLeave(link);
    act(() => vi.advanceTimersByTime(100));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });

  it('always cancels a focus timer when the consumer prevents default', () => {
    render(<TestNavLink onBlur={(event) => event.preventDefault()} />);
    const link = screen.getByRole('link');

    fireEvent.focus(link);
    fireEvent.blur(link);
    act(() => vi.advanceTimersByTime(100));

    expect(mockPreloadRoute).not.toHaveBeenCalled();
  });
});
