import { setActiveEnv } from '@/lib/supabase/env';

export type RemoteEnv = 'production' | 'staging';

export const reloadPage = () => window.location.reload();

// Matches AuthProvider's auth operation timeout.
const SIGN_OUT_WAIT_MS = 4000;

// Each project keeps its own auth storage key, so a failed or stalled sign-out
// cannot leak a session across projects. Switch anyway so a broken or
// unresponsive project cannot trap anyone.
export async function switchEnv(target: RemoteEnv, signOut: () => Promise<void>, reload: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      signOut(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('sign-out timed out')), SIGN_OUT_WAIT_MS);
      }),
    ]);
  } catch (error) {
    console.warn('Sign-out before environment switch failed:', error);
  } finally {
    clearTimeout(timer);
  }
  setActiveEnv(target);
  reload();
}
