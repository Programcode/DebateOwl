import { setActiveEnv } from '@/lib/supabase/env';

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
