import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { SUPABASE_URL } from '@/lib/supabase/client';

export default function LoginPage() {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/app';
  const { toast } = useToast();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      toast({
        title: 'Login Error',
        description: err instanceof Error ? err.message : 'Failed to start Google sign-in',
        variant: 'destructive',
      });
      setSigningIn(false);
    }
  };

  const handleResetAuth = () => {
    try {
      const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
      const prefix = `sb-${ref}-`;
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(prefix)) localStorage.removeItem(key);
      }
    } catch (err) {
      console.warn('[Auth] Failed to reset local auth state:', err);
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>Sign in to DebateLab</CardTitle>
          <CardDescription>Google sign-in is required to use the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Button className="w-full" onClick={() => void handleSignIn()} disabled={signingIn}>
              {signingIn ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redirecting...
                </>
              ) : (
                'Continue with Google'
              )}
            </Button>
            <Button className="w-full" variant="outline" onClick={handleResetAuth} disabled={signingIn}>
              Having trouble? Reset login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
