import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';

type AuthMode = 'email' | 'demo';
type AuthStatus = 'idle' | 'submitting' | 'code-sent' | 'verifying' | 'success' | 'error';

function isAuthMode(value: string): value is AuthMode {
  return value === 'email' || value === 'demo';
}

export default function LoginPage() {
  const { user, signInWithGoogle, signInWithEmailOtp, verifyEmailOtp, signInWithDemoCode } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const otpInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/app';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  useEffect(() => {
    if (authStatus === 'code-sent') otpInputRef.current?.focus();
  }, [authStatus]);

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

  const resetAuthState = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthStatus('idle');
    setErrorMessage('');
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setAuthStatus('error');
      setErrorMessage(t('login.requiredEmail', 'Enter your email address.'));
      return;
    }

    setErrorMessage('');
    setAuthStatus('submitting');
    try {
      await signInWithEmailOtp(normalizedEmail);
      setOtp('');
      setAuthStatus('code-sent');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('login.emailOtpError', 'Could not send code.'));
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedOtp = otp.trim();
    if (!normalizedOtp) {
      setAuthStatus('error');
      setErrorMessage(t('login.requiredOtp', 'Enter the verification code.'));
      return;
    }

    setErrorMessage('');
    setAuthStatus('verifying');
    try {
      await verifyEmailOtp(normalizedEmail, normalizedOtp);
      setAuthStatus('success');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('login.verifyOtpError', 'Could not verify code.'));
    }
  };

  const handleDemoSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = demoCode.trim();
    if (!normalizedCode) {
      setAuthStatus('error');
      setErrorMessage(t('login.requiredDemoCode', 'Enter your demo code.'));
      return;
    }

    setErrorMessage('');
    setAuthStatus('submitting');
    try {
      await signInWithDemoCode(normalizedCode);
      setAuthStatus('success');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('login.demoError', 'Could not sign in with demo code.'));
    }
  };

  const isSubmitting = authStatus === 'submitting' || authStatus === 'verifying';

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
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span>{t('login.orContinueWith', 'Or continue with')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Tabs
            value={authMode}
            onValueChange={(value) => {
              if (isAuthMode(value)) resetAuthState(value);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" disabled={isSubmitting}>{t('login.emailTab', 'Email')}</TabsTrigger>
              <TabsTrigger value="demo" disabled={isSubmitting}>{t('login.demoTab', 'Demo code')}</TabsTrigger>
            </TabsList>
            <TabsContent value="email">
              {authStatus === 'code-sent' || authStatus === 'verifying' || ((authStatus === 'error' || authStatus === 'success') && otp.length > 0) ? (
                <form onSubmit={(event) => void handleOtpSubmit(event)} className="space-y-4" aria-busy={authStatus === 'verifying'}>
                  <div className="space-y-2">
                    <Label htmlFor="login-otp">{t('login.otpLabel', 'Verification code')}</Label>
                    <Input
                      ref={otpInputRef}
                      id="login-otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      aria-describedby="login-otp-hint"
                      aria-invalid={authStatus === 'error'}
                      disabled={isSubmitting || authStatus === 'success'}
                    />
                    <p id="login-otp-hint" className="text-xs text-muted-foreground">
                      {t('login.codeSentDesc', 'Check your email for the six-digit code.')}
                    </p>
                  </div>
                  <Button className="w-full" type="submit" disabled={isSubmitting || authStatus === 'success'}>
                    {authStatus === 'verifying' ? t('login.verifying', 'Verifying...') : t('login.verifyCode', 'Verify code')}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => resetAuthState('email')} disabled={isSubmitting}>
                    {t('login.useDifferentEmail', 'Use a different email')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={(event) => void handleEmailSubmit(event)} className="space-y-4" aria-busy={authStatus === 'submitting'}>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('login.emailLabel', 'Email address')}</Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-describedby="login-email-hint"
                      aria-invalid={authStatus === 'error'}
                    />
                    <p id="login-email-hint" className="text-xs text-muted-foreground">
                      {t('login.emailHint', 'We\'ll send a six-digit code.')}
                    </p>
                  </div>
                  <Button className="w-full" type="submit" disabled={isSubmitting}>
                    {authStatus === 'submitting' ? t('login.sendingCode', 'Sending code...') : t('login.sendCode', 'Send code')}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="demo">
              <form onSubmit={(event) => void handleDemoSubmit(event)} className="space-y-4" aria-busy={authStatus === 'submitting'}>
                <div className="space-y-2">
                  <Label htmlFor="login-demo-code">{t('login.demoCodeLabel', 'Demo code')}</Label>
                  <Input
                    id="login-demo-code"
                    name="demoCode"
                    type="text"
                    autoComplete="off"
                    value={demoCode}
                    onChange={(event) => setDemoCode(event.target.value)}
                    aria-describedby="login-demo-code-hint"
                    aria-invalid={authStatus === 'error'}
                  />
                  <p id="login-demo-code-hint" className="text-xs text-muted-foreground">
                    {t('login.demoCodeHint', 'Enter the code provided by your event host.')}
                  </p>
                </div>
                <Button className="w-full" type="submit" disabled={isSubmitting || authStatus === 'success'}>
                  {authStatus === 'submitting' ? t('login.signingIn', 'Signing in...') : t('login.signInWithDemoCode', 'Sign in with demo code')}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          {authStatus === 'code-sent' && (
            <p className="mt-4 text-sm text-green-600" role="status" aria-live="polite">
              {t('login.codeSent', 'Code sent')}
            </p>
          )}
          {authStatus === 'success' && (
            <p className="mt-4 text-sm text-green-600" role="status" aria-live="polite">
              {t('login.signedIn', 'Signed in')}
            </p>
          )}
          {authStatus === 'error' && errorMessage && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
