import { useEffect, useRef, type ReactNode } from 'react';
import { OwlLoader } from '@/components/ui/loading-spinner';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { Loader2 } from 'lucide-react';
import { consumeWorkspaceInvite, stashWorkspaceInvite } from '@/lib/workspace/invite-handoff';
import { clearSignOutIntent, hasSignOutIntent } from '@/lib/supabase/sign-out-intent';

export function RequireAuth({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  // The account this layout last showed. A sign-out here stamps the redirect
  // with it, so LoginPage returns only that account to the page it left.
  const lastUserId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    lastUserId.current = user.id;
    clearSignOutIntent();
  }, [user]);

  if (loading) {
    // The caller's fallback brings its own <main>.
    if (fallback) return <>{fallback}</>;
    // Signed-out views have no AppLayout, so this is the page's one <main>.
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <OwlLoader message={t('common.loading')} />
      </main>
    );
  }

  if (!user) {
    const invite = stashWorkspaceInvite(location);
    // Signing out on purpose from Settings must not make Settings the next
    // sign-in's landing page (QA round 3); an invite still survives.
    const from = invite ? "/app/workspaces/invite" : hasSignOutIntent() ? null : location.pathname;
    return (
      <Navigate
        to="/login"
        state={from ? { from: { pathname: from }, fromUserId: lastUserId.current } : null}
        replace
      />
    );
  }

  const invite = location.pathname === "/app/workspaces/invite"
    ? null
    : consumeWorkspaceInvite();
  if (invite) return <Navigate to={invite} replace />;

  return <>{children}</>;
}
