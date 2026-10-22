import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { safeNextPath } from '@/lib/auth-callback';

/**
 * Where Google and the emailed sign-in link return. AuthProvider exchanges the
 * code and holds `loading` until it settles; this page then opens `next`, or
 * /login, which says why the sign-in failed.
 */
export default function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const next = safeNextPath(params.get('next'));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-background text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span>{t('login.finishingSignIn', 'Signing you in…')}</span>
      </div>
    );
  }

  if (user) return <Navigate to={next} replace />;
  return <Navigate to="/login" state={{ from: { pathname: next } }} replace />;
}
