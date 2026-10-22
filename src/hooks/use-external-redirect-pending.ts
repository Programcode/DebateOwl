import { useCallback, useEffect, useRef, useState } from 'react';

const SAFETY_TIMEOUT_MS = 8000;

/**
 * Pending state for a button that leaves the site (Google sign-in, Stripe
 * Checkout or portal). `run` sets pending, awaits the navigation helper, and
 * clears pending if it throws. When the user comes back with Back, the browser
 * may restore this page from the back/forward cache with React state frozen,
 * so pending is also cleared on a persisted `pageshow`, when the page becomes
 * visible again after it hid, and a few seconds after navigation started.
 *
 * Nothing clears pending while the helper is still running, `reset` included:
 * the helper ends in a navigation that can't be cancelled, so releasing the
 * button early would let a second click start a second request.
 */
export function useExternalRedirectPending(timeoutMs = SAFETY_TIMEOUT_MS) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const requestingRef = useRef(false);
  const hiddenRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    pendingRef.current = false;
    hiddenRef.current = false;
    setPending(false);
  }, []);

  const reset = useCallback(() => {
    if (!requestingRef.current) clear();
  }, [clear]);

  const run = useCallback(async (navigate: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    requestingRef.current = true;
    setPending(true);
    try {
      await navigate();
    } catch (error) {
      requestingRef.current = false;
      clear();
      throw error;
    }
    requestingRef.current = false;
    timerRef.current = setTimeout(clear, timeoutMs);
  }, [clear, timeoutMs]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && pendingRef.current) reset();
    };
    const onVisibilityChange = () => {
      if (!pendingRef.current || requestingRef.current) return;
      if (document.visibilityState === 'hidden') hiddenRef.current = true;
      else if (hiddenRef.current) clear();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(timerRef.current);
    };
  }, [clear, reset]);

  return { pending, run, reset };
}
