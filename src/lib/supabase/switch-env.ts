import { setActiveEnv } from '@/lib/supabase/env';

export type RemoteEnv = 'production' | 'staging';

export const reloadPage = () => window.location.reload();

// Each project keeps its own auth storage key, so a failed sign-out cannot leak
// a session across projects. Switch anyway so a broken project cannot trap anyone.
export async function switchEnv(target: RemoteEnv, signOut: () => Promise<void>, reload: () => void) {
  try {
    await signOut();
  } catch (error) {
    console.warn('Sign-out before environment switch failed:', error);
  }
  setActiveEnv(target);
  reload();
}
