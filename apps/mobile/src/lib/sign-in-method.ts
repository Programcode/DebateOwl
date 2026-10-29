import type { User } from '@supabase/supabase-js';

/** The website's account-level method, including Apple's linked identities on iOS. */
export function signInMethodKey(user: User | null): string | null {
  if (!user) return null;
  const meta = user.app_metadata;
  if (typeof meta?.demo_access_code_id === 'string') return 'settings.signInDemo';
  const providers = new Set<unknown>([
    ...(Array.isArray(meta?.providers) ? meta.providers : [meta?.provider]),
    ...(user.identities ?? []).map((identity) => identity.provider),
  ]);
  const google = providers.has('google');
  const email = providers.has('email');
  if (providers.has('apple')) {
    if (google && email) return 'mobile.you.signInAppleGoogleOrEmail';
    if (google) return 'mobile.you.signInAppleOrGoogle';
    if (email) return 'mobile.you.signInAppleOrEmail';
    return 'mobile.you.signInApple';
  }
  if (google && email) return 'settings.signInGoogleOrEmail';
  if (google) return 'settings.signInGoogle';
  if (email) return 'settings.signInEmail';
  return null;
}
