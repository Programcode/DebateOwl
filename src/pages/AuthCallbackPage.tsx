import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
    if (loading || !user || !callbackError || callbackError === 'timed-out') return;
    toast({ title: t(AUTH_CALLBACK_ERROR_KEYS[callbackError]), variant: 'destructive' });
    clearCallbackError();
  }, [loading, user, callbackError, clearCallbackError, t, toast]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <span>{t('login.finishingSignIn', 'Signing you in…')}</span>
        </div>
      </main>
    );
  }

  // The exchange did not answer in time. This URL still holds the unused code,
  // so a reload retries it; a late answer clears this and the page moves on.
  // Checked before `user`: a session this browser already had must not hide it.
  if (callbackError === 'timed-out') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-xl font-semibold">{t('login.title')}</h1>
        <p className="max-w-sm text-sm" role="alert">{t('login.errors.callbackTimedOut')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}>{t('login.retrySignIn')}</Button>
          <Button variant="outline" asChild>
            <Link to="/login" state={{ from: { pathname: next } }} replace>{t('login.backToSignIn')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (user) return <Navigate to={next} replace />;
  return <Navigate to="/login" state={{ from: { pathname: next } }} replace />;
}
