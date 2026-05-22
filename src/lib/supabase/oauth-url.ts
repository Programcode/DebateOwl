import { SUPABASE_URL } from './client';
import { getOAuthRedirectUrl } from '@/lib/native';

export function buildGoogleOAuthUrl({
  driveAccess = false,
  redirectTo = getOAuthRedirectUrl(),
}: {
  driveAccess?: boolean;
  redirectTo?: string;
} = {}) {
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: redirectTo,
  });

  if (driveAccess) {
    params.set('scopes', 'https://www.googleapis.com/auth/drive.file');
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return `${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`;
}
