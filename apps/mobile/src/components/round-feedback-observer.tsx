import { useEffect } from 'react';

import { roundFeedback } from '@/lib/round-feedback';
import { useTimerStore } from '@/lib/timer-store';

/** Reads timer changes while its screen is closed; never drives or changes a clock. */
export function RoundFeedbackObserver() {
  const { session, loaded } = useTimerStore();
  useEffect(() => {
    if (loaded) roundFeedback.observe(session, Date.now());
  }, [loaded, session]);
  return null;
}
