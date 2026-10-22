import { useCallback, useEffect, useRef, useState } from 'react';

const SAFETY_TIMEOUT_MS = 8000;

/**
 * Pending state for a button that leaves the site (Google sign-in, Stripe
 * Checkout or portal). `run` sets pending, awaits the navigation helper, and
 * clears pending if it throws. When the user comes back with Back, the browser
 * may restore this page from the back/forward cache with React state frozen,
 * so pending is also cleared on a persisted `pageshow`, when the page becomes
 * visible again after it hid, and a few seconds after navigation started.
 * Those resets wait until the helper resolved, so a slow request can't be
 * started twice.
 */
export function useExternalRedirectPending(timeoutMs = SAFETY_TIMEOUT_MS) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const navigatingRef = useRef(false);
  const hiddenRef = useRef(false);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const reset = useCallback(() => {
    generationRef.current += 1;
    clearTimeout(timerRef.current);
    pendingRef.current = false;
    navigatingRef.current = false;
    hiddenRef.current = false;
    setPending(false);
  }, []);

  const run = useCallback(async (navigate: () => Promise<void>) => {
    if (pendingRef.current) return;
    const generation = ++generationRef.current;
    pendingRef.current = true;
    setPending(true);
    try {
      await navigate();
    } catch (error) {
      if (generation === generationRef.current) reset();
      throw error;
    }
    if (generation !== generationRef.current) return;
    navigatingRef.current = true;
    timerRef.current = setTimeout(reset, timeoutMs);
  }, [reset, timeoutMs]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && pendingRef.current) reset();
    };
    const onVisibilityChange = () => {
      if (!navigatingRef.current) return;
      if (document.visibilityState === 'hidden') hiddenRef.current = true;
      else if (hiddenRef.current) reset();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(timerRef.current);
    };
  }, [reset]);

  return { pending, run, reset };
}
