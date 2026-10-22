import { useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { Loader2 } from 'lucide-react';
import { consumeWorkspaceInvite, stashWorkspaceInvite } from '@/lib/workspace/invite-handoff';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // The account this layout last showed. A sign-out here stamps the redirect
  // with it, so LoginPage returns only that account to the page it left.
  const lastUserId = useRef<string | undefined>(undefined);
  if (user) lastUserId.current = user.id;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
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
