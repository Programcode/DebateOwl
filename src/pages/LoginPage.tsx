import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { consumeWorkspaceInvite } from '@/lib/workspace/invite-handoff';
import { localizeAuthError } from '@/lib/auth-errors';

type AuthMode = 'email' | 'demo';
type AuthStatus = 'idle' | 'submitting' | 'code-sent' | 'verifying' | 'success' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_CODE_PATTERN = /^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

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
  const [emailSent, setEmailSent] = useState(false);
  const [demoCode, setDemoCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const otpInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/app';

  useEffect(() => {
    if (user) navigate(consumeWorkspaceInvite() ?? from, { replace: true });
  }, [user, navigate, from]);

  useEffect(() => {
    if (authStatus === 'code-sent') otpInputRef.current?.focus();
  }, [authStatus]);

  // An error is shown under the field it is about, and focus moves there.
  useEffect(() => {
    if (authStatus !== 'error') return;
    const field = authMode === 'demo' ? demoInputRef : emailSent ? otpInputRef : emailInputRef;
    field.current?.focus();
  }, [authStatus, authMode, emailSent]);

  const handleGoogleSignIn = async () => {
    setIsRedirecting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setIsRedirecting(false);
      toast({
        title: t('login.failed', 'Could not start sign in'),
        description: localizeAuthError(error, t, 'login.tryAgain', 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const resetAuthState = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthStatus('idle');
    setErrorMessage('');
    setOtp('');
    setEmailSent(false);
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setAuthStatus('error');
      setErrorMessage(t('login.invalidEmail', 'Enter a valid email address.'));
      return;
    }

    setErrorMessage('');
    setAuthStatus('submitting');
    try {
      await signInWithEmailOtp(normalizedEmail);
      setOtp('');
      setEmailSent(true);
      setAuthStatus('code-sent');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(localizeAuthError(error, t, 'login.emailOtpError', 'Could not send code.'));
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedOtp = otp.trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
      setAuthStatus('error');
      setErrorMessage(t('login.invalidCode', 'Enter a valid six-digit code.'));
      return;
    }

    setErrorMessage('');
    setAuthStatus('verifying');
    try {
      await verifyEmailOtp(normalizedEmail, normalizedOtp);
      setAuthStatus('success');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(localizeAuthError(error, t, 'login.verifyOtpError', 'Could not verify code.'));
    }
  };

  const handleResend = async () => {
    setErrorMessage('');
    setAuthStatus('submitting');
    try {
      await signInWithEmailOtp(email.trim());
      setOtp('');
      setAuthStatus('code-sent');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(localizeAuthError(error, t, 'login.emailOtpError', 'Could not send code.'));
    }
  };

  const handleDemoSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = demoCode.trim().toUpperCase().replace(/\s+/g, '');
    if (!DEMO_CODE_PATTERN.test(normalizedCode)) {
      setAuthStatus('error');
      setErrorMessage(t('login.invalidDemoCode', 'Enter a valid demo code.'));
      return;
    }

    setErrorMessage('');
    setAuthStatus('submitting');
    try {
      await signInWithDemoCode(normalizedCode);
      setAuthStatus('success');
    } catch (error) {
      setAuthStatus('error');
      setErrorMessage(localizeAuthError(error, t, 'login.demoError', 'Could not sign in with demo code.'));
    }
  };

  const isSubmitting = authStatus === 'submitting' || authStatus === 'verifying';
  const hasError = authStatus === 'error' && Boolean(errorMessage);
  const fieldError = (id: string) => hasError && (
    <p id={id} className="text-sm text-destructive" role="alert">{errorMessage}</p>
  );
  const describedBy = (hintId: string, errorId: string) => hasError ? `${hintId} ${errorId}` : hintId;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('login.backHome', 'Back to DebateLab')}
        </Link>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white dark:bg-slate-800">
            <img src="/favicon-72.png" alt="" width={48} height={48} className="h-full w-full object-cover" />
          </div>
          {/* The page heading, styled like CardTitle (which renders an h3). */}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">{t('login.title')}</h1>
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
              {emailSent ? (
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
                      placeholder={t('login.verificationCodePlaceholder', '123456')}
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      aria-describedby={describedBy('login-otp-hint', 'login-otp-error')}
                      aria-invalid={authStatus === 'error'}
                      disabled={isSubmitting || authStatus === 'success'}
                    />
                    {fieldError('login-otp-error')}
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
                  <Button type="button" variant="ghost" className="w-full" onClick={() => void handleResend()} disabled={isSubmitting || authStatus === 'success'}>
                    {authStatus === 'submitting' ? t('login.resendingCode', 'Resending code...') : t('login.resendCode', 'Resend code')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={(event) => void handleEmailSubmit(event)} className="space-y-4" aria-busy={authStatus === 'submitting'}>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('login.emailLabel', 'Email address')}</Label>
                    <Input
                      ref={emailInputRef}
                      id="login-email"
                      name="email"
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      placeholder={t('login.emailPlaceholder', 'you@example.com')}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-describedby={describedBy('login-email-hint', 'login-email-error')}
                      aria-invalid={authStatus === 'error'}
                    />
                    {fieldError('login-email-error')}
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
                    ref={demoInputRef}
                    id="login-demo-code"
                    name="demoCode"
                    type="text"
                    autoComplete="off"
                    placeholder={t('login.demoCodePlaceholder', 'DEMO-AB12-CD34')}
                    maxLength={14}
                    value={demoCode}
                    onChange={(event) => setDemoCode(event.target.value)}
                    aria-describedby={describedBy('login-demo-code-hint', 'login-demo-code-error')}
                    aria-invalid={authStatus === 'error'}
                  />
                  {fieldError('login-demo-code-error')}
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
            <p className="mt-4 text-sm text-success" role="status" aria-live="polite">
              {t('login.codeSent', 'Code sent')}
            </p>
          )}
          {authStatus === 'success' && (
            <p className="mt-4 text-sm text-success" role="status" aria-live="polite">
              {t('login.signedIn', 'Signed in')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
