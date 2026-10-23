import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { Loader2 } from 'lucide-react';
import { consumeWorkspaceInvite, stashWorkspaceInvite } from '@/lib/workspace/invite-handoff';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  // The account this layout last showed. A sign-out here stamps the redirect
  // with it, so LoginPage returns only that account to the page it left.
  const lastUserId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (user) lastUserId.current = user.id;
  }, [user]);

  if (loading) {
    // Signed-out views have no AppLayout, so this is the page's one <main>.
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      </main>
    );
  }

  if (!user) {
    const invite = stashWorkspaceInvite(location);
    return (
      <Navigate
        to="/login"
        state={{ from: { pathname: invite ? "/app/workspaces/invite" : location.pathname }, fromUserId: lastUserId.current }}
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
