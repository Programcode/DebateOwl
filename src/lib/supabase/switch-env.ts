import { useEffect } from 'react';
import { ENV_STORAGE_KEY, getActiveEnv, isEnvPinned, setActiveEnv } from '@/lib/supabase/env';

export type RemoteEnv = 'production' | 'staging';

export const reloadPage = () => window.location.reload();

// leaveEnvironment is bounded and clears this project's local session and data
// itself, so a failure here cannot trap anyone or leak data across projects.
export async function switchEnv(target: RemoteEnv, leaveEnvironment: () => Promise<void>, reload: () => void) {
  try {
    await leaveEnvironment();
  } catch (error) {
    console.warn('Leaving the current environment failed:', error);
  }
  setActiveEnv(target);
  reload();
}

/**
 * Every tab shares the persisted stores, but each tab picks its project once at
 * startup. When another tab switches projects, reload this one before it can
 * merge the other project's data or send its own to the wrong project.
 */
export function useReloadOnEnvChange(discardTabState: () => void, reload: () => void = reloadPage) {
  useEffect(() => {
    const active = getActiveEnv();
    if (active === 'local' || isEnvPinned()) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== ENV_STORAGE_KEY) return;
      const next: RemoteEnv = localStorage.getItem(ENV_STORAGE_KEY) === 'staging' ? 'staging' : 'production';
      if (next === active) return;
      // The switching tab already cleared the shared stores, and they may now
      // hold the new project's data. Clear only what belongs to this tab.
      discardTabState();
      reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [discardTabState, reload]);
}
