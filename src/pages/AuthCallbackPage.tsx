import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { AUTH_CALLBACK_ERROR_KEYS, safeNextPath } from '@/lib/auth-callback';

/**
 * Where Google and the emailed sign-in link return. AuthProvider exchanges the
 * code and holds `loading` until it settles; this page then opens `next`, or
 * /login, which says why the sign-in failed.
 */
export default function AuthCallbackPage() {
  const { user, loading, callbackError, clearCallbackError } = useAuth();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const { toast } = useToast();
  const next = safeNextPath(params.get('next'));

  // The link failed, but this browser is still signed in to another session:
  // that account opens, and the failure is still said.
  useEffect(() => {
    if (loading || !user || !callbackError) return;
    toast({ title: t(AUTH_CALLBACK_ERROR_KEYS[callbackError]), variant: 'destructive' });
    clearCallbackError();
  }, [loading, user, callbackError, clearCallbackError, t, toast]);

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
