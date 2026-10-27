import { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { OwlMark } from '@/components/brand/Owl';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useExternalRedirectPending } from '@/hooks/use-external-redirect-pending';
import { consumeWorkspaceInvite } from '@/lib/workspace/invite-handoff';
import { authRetryAfterSeconds, localizeAuthError } from '@/lib/auth-errors';
import { clearSessionExpiredNotice, sessionExpiredNotice } from '@/lib/supabase/session-expiry';
import { clearSignOutIntent } from '@/lib/supabase/sign-out-intent';
import { AUTH_CALLBACK_ERROR_KEYS } from '@/lib/auth-callback';
import {
  DEMO_CODE_PATTERN,
  EMAIL_MAX_LENGTH,
  emailProblem,
  formatDemoCodeAt,
  formatWait,
  resendCooldownSeconds,
  startResendCooldown,
  type EmailProblem,
} from '@/lib/login-form';

type AuthMode = 'email' | 'demo';
type AuthStatus = 'idle' | 'submitting' | 'code-sent' | 'verifying' | 'success' | 'error';
/** What the code step says about the code: just sent, sent again, or sent from this tab a moment ago. */
type SentNotice = 'sent' | 'resent' | 'recent';

const OTP_LENGTH = 6;
// Sending a code often takes 3–11 s; after this long the button says so.
const SLOW_SEND_MS = 4000;

const EMAIL_PROBLEM_KEYS: Record<EmailProblem, string> = {
  required: 'login.emailRequired',
  tooLong: 'login.emailTooLong',
  invalid: 'login.invalidEmail',
};

const SENT_NOTICE_KEYS: Record<SentNotice, string> = {
  sent: 'login.codeSent',
  resent: 'login.codeResent',
  recent: 'login.codeRecentlySent',
};

/** Email codes are digits only. Pasted spaces, dashes and letters never reach Auth. */
function otpDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

function isAuthMode(value: string): value is AuthMode {
  return value === 'email' || value === 'demo';
}

/**
 * Seconds before `address` can get another code, read again every second while
 * it is above zero. `refresh` reads the clock now, after a cooldown starts.
 */
function useResendCountdown(address: string, active: boolean): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  const seconds = active ? resendCooldownSeconds(address, now) : 0;
  const running = seconds > 0;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return [seconds, () => setNow(Date.now())];
}

/** RequireAuth's redirect: the page that needed sign-in, and whose session just ended there. */
type LoginRouteState = { from?: { pathname?: string }; fromUserId?: string } | null;

export default function LoginPage() {
  const { user, callbackError, clearCallbackError, signInWithGoogle, signInWithEmailOtp, verifyEmailOtp, signInWithDemoCode } = useAuth();
  const { pending: isRedirecting, run: runRedirect } = useExternalRedirectPending();
  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [demoCode, setDemoCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // Auth refused a resend and named a wait: the error goes when the button's countdown ends.
  const [waitError, setWaitError] = useState(false);
  // The address the code went to, fixed when it was sent: verify and resend use it.
  const [sentTo, setSentTo] = useState('');
  const [sentNotice, setSentNotice] = useState<SentNotice>('sent');
  const [slowSend, setSlowSend] = useState(false);
  // Set when the server refused this tab's session and it was signed out.
  const [sessionExpired, setSessionExpired] = useState(sessionExpiredNotice);
  // Why the sign-in link or Google sign-in that opened this page failed. Kept
  // until the next send; the provider's copy is cleared so it doesn't come back.
  const [linkError, setLinkError] = useState(callbackError);
  // One click sends one request: Enter in the field can't start a second while one runs.
  const sendingRef = useRef(false);
  const [resendIn, refreshClock] = useResendCountdown(sentTo, emailSent);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const routeState = location.state as LoginRouteState;
  // A page another account had open belongs to that account. After a sign-out
  // the next person at this browser starts on /app, not where they left off.
  const fromThisAccount = !routeState?.fromUserId || routeState.fromUserId === user?.id;
  const from = (fromThisAccount && routeState?.from?.pathname) || '/app';
  // Google and the email link reload the page, so the deep link travels in the redirect.
  const next = routeState?.fromUserId ? undefined : routeState?.from?.pathname;

  useEffect(() => {
    if (user) navigate(consumeWorkspaceInvite() ?? from, { replace: true });
  }, [user, navigate, from]);

  // The sign-out redirect has landed here; later deep links keep their page again.
  useEffect(() => clearSignOutIntent(), []);

  useEffect(() => {
    if (callbackError) clearCallbackError();
  }, [callbackError, clearCallbackError]);

  useEffect(() => {
    if (sessionExpired) clearSessionExpiredNotice();
  }, [sessionExpired]);

  useEffect(() => {
    if (authStatus === 'code-sent') otpInputRef.current?.focus();
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'submitting') return;
    const timer = window.setTimeout(() => setSlowSend(true), SLOW_SEND_MS);
    return () => {
      window.clearTimeout(timer);
      setSlowSend(false);
    };
  }, [authStatus]);

  // An error is shown under the field it is about, and focus moves there.
  useEffect(() => {
    if (authStatus !== 'error') return;
    const field = authMode === 'demo' ? demoInputRef : emailSent ? otpInputRef : emailInputRef;
    field.current?.focus();
  }, [authStatus, authMode, emailSent]);

  const handleGoogleSignIn = async () => {
    try {
      await runRedirect(() => signInWithGoogle({ next }));
    } catch (error) {
      toast({
        title: t('login.failed', 'Could not start sign in'),
        description: localizeAuthError(error, t, 'login.tryAgain', 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  // Notices from before this attempt (an old error, a failed link, an ended session) go.
  const clearNotices = () => {
    setErrorMessage('');
    setWaitError(false);
    setLinkError(null);
    setSessionExpired(false);
  };

  const resetAuthState = (mode: AuthMode) => {
    clearNotices();
    setAuthMode(mode);
    setAuthStatus('idle');
    setOtp('');
    setEmailSent(false);
  };

  const showError = (message: string) => {
    setWaitError(false);
    setAuthStatus('error');
    setErrorMessage(message);
  };

  const showCodeStep = (notice: SentNotice, address: string) => {
    setSentTo(address);
    setOtp('');
    setSentNotice(notice);
    setEmailSent(true);
    setAuthStatus('code-sent');
    refreshClock();
  };

  /** Sends a code to `address`. Returns once the request settles; never runs two at once. */
  const sendCode = async (address: string, isResend: boolean) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    clearNotices();
    setAuthStatus('submitting');
    try {
      await signInWithEmailOtp(address, { next });
      startResendCooldown(address);
      showCodeStep(isResend ? 'resent' : 'sent', address);
    } catch (error) {
      const wait = authRetryAfterSeconds(error);
      if (wait !== null) startResendCooldown(address, wait);
      if (wait !== null && !isResend) {
        // Auth only asks for a wait when it sent this address a code moments ago
        // (from another tab, or before the cooldown was stored): that code works.
        showCodeStep('recent', address);
        return;
      }
      refreshClock();
      if (wait !== null) {
        // The time is fixed in the alert, so a screen reader hears it once; the button counts down.
        showError(localizeAuthError(error, t, 'login.emailOtpError', 'Could not send code.'));
        setWaitError(true);
        return;
      }
      // The hourly email cap names no wait; the button still holds off a minute.
      if (isResend && (error as { status?: unknown } | null)?.status === 429) startResendCooldown(address);
      showError(localizeAuthError(error, t, 'login.emailOtpError', 'Could not send code.'));
    } finally {
      sendingRef.current = false;
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current) return;
    const normalizedEmail = email.trim();
    const problem = emailProblem(normalizedEmail);
    if (problem) {
      showError(t(EMAIL_PROBLEM_KEYS[problem], { max: EMAIL_MAX_LENGTH }));
      return;
    }
    // This tab sent this address a code less than a minute ago (perhaps before a
    // reload). Sending again would only be refused, so ask for that code instead.
    if (resendCooldownSeconds(normalizedEmail) > 0) {
      clearNotices();
      showCodeStep('recent', normalizedEmail);
      return;
    }
    await sendCode(normalizedEmail, false);
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedOtp = otp.trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
      showError(t('login.invalidCode', 'Enter a valid six-digit code.'));
      return;
    }

    setErrorMessage('');
    setWaitError(false);
    setAuthStatus('verifying');
    try {
      await verifyEmailOtp(sentTo, normalizedOtp);
      setAuthStatus('success');
    } catch (error) {
      showError(localizeAuthError(error, t, 'login.verifyOtpError', 'Could not verify code.'));
    }
  };

  const handleResend = async () => {
    if (resendCooldownSeconds(sentTo) > 0) return;
    await sendCode(sentTo, true);
  };

  const handleDemoSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current) return;
    // The field already holds the masked code.
    if (!DEMO_CODE_PATTERN.test(demoCode)) {
      showError(demoCode
        ? t('login.invalidDemoCodeFormat', 'Demo codes look like DEMO-AB12-CD34.')
        : t('login.demoCodeRequired', 'Enter your demo code.'));
      return;
    }

    sendingRef.current = true;
    clearNotices();
    setAuthStatus('submitting');
    try {
      await signInWithDemoCode(demoCode);
      setAuthStatus('success');
    } catch (error) {
      showError(localizeAuthError(error, t, 'login.demoError', 'Could not sign in with demo code.'));
    } finally {
      sendingRef.current = false;
    }
  };

  const isSubmitting = authStatus === 'submitting' || authStatus === 'verifying';
  const shownError = waitError && resendIn === 0 ? '' : errorMessage;
  const hasError = authStatus === 'error' && Boolean(shownError);
  const fieldError = (id: string) => hasError && (
    <p id={id} className="text-sm text-destructive" role="alert">{shownError}</p>
  );
  const handleDemoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const masked = formatDemoCodeAt(input.value, input.selectionStart ?? input.value.length);
    setDemoCode(masked.value);
    // React puts the caret at the end when the value is rewritten; keep it where the person typed.
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(masked.caret, masked.caret);
    });
  };
  const describedBy = (hintId: string, errorId: string) => hasError ? `${hintId} ${errorId}` : hintId;
  const pending = (label: string) => (
    <>
      <LoadingSpinner size="sm" />
      {label}
    </>
  );
  const resendLabel = authStatus === 'submitting'
    ? pending(t('login.resendingCode', 'Resending code...'))
    : resendIn > 0
      ? t('login.resendIn', { time: formatWait(resendIn) })
      : t('login.resendCode', 'Resend code');

  return (
    // Below md (768 px), phones included, the card starts near the top; from md up it sits in the middle.
    <main className="min-h-screen flex flex-col items-center justify-start gap-4 bg-background px-4 py-4 md:justify-center md:py-8">
      <div className="flex w-full max-w-md items-center justify-between gap-4">
        <Link to="/" className="inline-flex min-h-6 items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('login.backHome', 'Back to DebateOwl')}
        </Link>
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <OwlMark size={56} className="mx-auto mb-3" />
          {/* The page heading, styled like CardTitle (which renders an h2 by default). */}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">{t('login.title')}</h1>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionExpired && (
            <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm" role="status">
              {t('login.sessionExpired', 'Your session expired. Sign in again.')}
            </p>
          )}
          {linkError && authStatus === 'idle' && (
            <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {t(AUTH_CALLBACK_ERROR_KEYS[linkError])}
            </p>
          )}
          <Button className="w-full" onClick={() => void handleGoogleSignIn()} disabled={isRedirecting}>
            {isRedirecting ? t('login.redirecting', 'Redirecting...') : t('login.google')}
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span>{t('login.orContinueWith', 'Or continue with')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* Forms are noValidate: the browser's own bubble would show in its language, beside ours. */}
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
                <form noValidate onSubmit={(event) => void handleOtpSubmit(event)} className="space-y-4" aria-busy={authStatus === 'verifying'}>
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
                      value={otp}
                      onChange={(event) => setOtp(otpDigits(event.target.value))}
                      aria-describedby={describedBy('login-otp-hint', 'login-otp-error')}
                      aria-invalid={hasError}
                      disabled={isSubmitting || authStatus === 'success'}
                    />
                    {fieldError('login-otp-error')}
                    <p id="login-otp-hint" className="text-xs text-muted-foreground">
                      {t('login.codeSentDesc', 'Check your email for the six-digit code.')}
                    </p>
                  </div>
                  <Button className="w-full" type="submit" disabled={isSubmitting || authStatus === 'success' || otp.length !== OTP_LENGTH}>
                    {authStatus === 'verifying' ? pending(t('login.verifying', 'Verifying...')) : t('login.verifyCode', 'Verify code')}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => resetAuthState('email')} disabled={isSubmitting}>
                    {t('login.useDifferentEmail', 'Use a different email')}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => void handleResend()} disabled={isSubmitting || authStatus === 'success' || resendIn > 0}>
                    {resendLabel}
                  </Button>
                </form>
              ) : (
                <form noValidate onSubmit={(event) => void handleEmailSubmit(event)} className="space-y-4" aria-busy={authStatus === 'submitting'}>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('login.emailLabel', 'Email address')}</Label>
                    <Input
                      ref={emailInputRef}
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder={t('login.emailPlaceholder', 'you@example.com')}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={isSubmitting}
                      aria-describedby={describedBy('login-email-hint', 'login-email-error')}
                      aria-invalid={hasError}
                    />
                    {fieldError('login-email-error')}
                    <p id="login-email-hint" className="text-xs text-muted-foreground">
                      {t('login.emailHint', 'We\'ll send a six-digit code.')}
                    </p>
                  </div>
                  <Button className="w-full" type="submit" disabled={isSubmitting}>
                    {authStatus === 'submitting' ? pending(t('login.sendingCode', 'Sending code...')) : t('login.sendCode', 'Send code')}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="demo">
              <form noValidate onSubmit={(event) => void handleDemoSubmit(event)} className="space-y-4" aria-busy={authStatus === 'submitting'}>
                <div className="space-y-2">
                  <Label htmlFor="login-demo-code">{t('login.demoCodeLabel', 'Demo code')}</Label>
                  <Input
                    ref={demoInputRef}
                    id="login-demo-code"
                    name="demoCode"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder={t('login.demoCodePlaceholder', 'DEMO-AB12-CD34')}
                    pattern="DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}"
                    // No maxLength: a paste with spaces around the code would be cut before the mask
                    // sees it. The mask keeps at most DEMO-XXXX-XXXX.
                    value={demoCode}
                    onChange={handleDemoChange}
                    aria-describedby={describedBy('login-demo-code-hint', 'login-demo-code-error')}
                    aria-invalid={hasError}
                  />
                  {fieldError('login-demo-code-error')}
                  <p id="login-demo-code-hint" className="text-xs text-muted-foreground">
                    {t('login.demoCodeHint', 'Enter the code provided by your event host.')}
                  </p>
                </div>
                <Button className="w-full" type="submit" disabled={isSubmitting || authStatus === 'success'}>
                  {authStatus === 'submitting' ? pending(t('login.signingIn', 'Signing in...')) : t('login.signInWithDemoCode', 'Sign in with demo code')}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          {authStatus === 'submitting' && slowSend && (
            <p className="mt-4 text-sm text-muted-foreground" role="status" aria-live="polite">
              {t('login.slowSend', 'This can take a few seconds.')}
            </p>
          )}
          {authStatus === 'code-sent' && (
            <p className="mt-4 text-sm text-success-text" role="status" aria-live="polite">
              {t(SENT_NOTICE_KEYS[sentNotice])}
            </p>
          )}
          {authStatus === 'success' && (
            <p className="mt-4 text-sm text-success-text" role="status" aria-live="polite">
              {t('login.signedIn', 'Signed in')}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
