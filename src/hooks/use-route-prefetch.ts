import { useCallback, useEffect, useRef } from 'react';
import type { FocusEventHandler, PointerEventHandler, TouchEventHandler } from 'react';
import { useResolvedPath, type To } from 'react-router-dom';
import { preloadRoute, routeLoaders } from '@/lib/route-modules';

const INTENT_DELAY_MS = 100;

function routePathname(to: To, resolvedPathname: string): string | undefined {
  if (typeof window === 'undefined') return undefined;

  const href = typeof to === 'string' ? to : to.pathname;
  if (!href) return undefined;

  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? resolvedPathname : undefined;
  } catch {
    return undefined;
  }
}

function allowsPrefetch(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}

export type RoutePrefetchHandlers = {
  onPointerEnter: PointerEventHandler<HTMLAnchorElement>;
  onPointerLeave: PointerEventHandler<HTMLAnchorElement>;
  onFocus: FocusEventHandler<HTMLAnchorElement>;
  onBlur: FocusEventHandler<HTMLAnchorElement>;
  onPointerDown: PointerEventHandler<HTMLAnchorElement>;
  onTouchStart: TouchEventHandler<HTMLAnchorElement>;
};

export function useRoutePrefetch(to: To): RoutePrefetchHandlers {
  const pathname = routePathname(to, useResolvedPath(to).pathname);
  const timerRef = useRef<number | undefined>(undefined);
  const prefetchedRef = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const startPrefetch = useCallback(() => {
    cancelTimer();
    if (
      !pathname
      || !Object.prototype.hasOwnProperty.call(routeLoaders, pathname)
      || prefetchedRef.current
      || !allowsPrefetch()
    ) return;

    prefetchedRef.current = true;
    const preload = preloadRoute(pathname);
    if (preload) {
      void preload.catch(() => {
        prefetchedRef.current = false;
      });
    }
  }, [cancelTimer, pathname]);

  const schedulePrefetch = useCallback(() => {
    if (!pathname || prefetchedRef.current || !allowsPrefetch() || timerRef.current !== undefined) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      startPrefetch();
    }, INTENT_DELAY_MS);
  }, [pathname, startPrefetch]);

  useEffect(() => {
    prefetchedRef.current = false;
    cancelTimer();
    return cancelTimer;
  }, [cancelTimer, pathname]);

  return {
    onPointerEnter: schedulePrefetch,
    onPointerLeave: cancelTimer,
    onFocus: schedulePrefetch,
    onBlur: cancelTimer,
    onPointerDown: startPrefetch,
    onTouchStart: startPrefetch,
  };
}
