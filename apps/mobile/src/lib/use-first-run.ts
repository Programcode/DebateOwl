import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { firstRunPlan } from './first-run';

/**
 * Opens the first run once the app's navigation is ready: Ollie's welcome when
 * this phone has not seen it, then the tour when this account has not
 * finished it (the website's FirstRun). Once per signed-in account per launch.
 */
export function useFirstRun(userId: string | null) {
  const router = useRouter();
  const ready = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    if (!userId || !ready) return;
    let live = true;
    void firstRunPlan(userId).then((plan) => {
      if (!live || (!plan.showIntro && plan.tourDone)) return;
      router.push({ pathname: '/welcome', params: { intro: plan.showIntro ? '1' : '0', tour: plan.tourDone ? 'done' : 'todo' } });
    });
    return () => {
      live = false;
    };
  }, [userId, ready, router]);
}
