import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const { user, signInWithGoogle } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/app';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const handleGoogleSignIn = async () => {
    setIsRedirecting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setIsRedirecting(false);
      toast({
        title: t('login.failed', 'Could not start sign in'),
        description: error instanceof Error ? error.message : t('login.tryAgain', 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => void handleGoogleSignIn()} disabled={isRedirecting}>
            {isRedirecting ? t('login.redirecting', 'Redirecting...') : t('login.google')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
