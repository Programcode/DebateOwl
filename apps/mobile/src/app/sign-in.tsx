import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SuccessCheck } from '@/components/success-check';
import { MainActionButton, SecondaryButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { signInErrorKey } from '@/lib/sign-in-errors';
import { appleSignInAvailable, googleSignInAvailable, signInWithApple, signInWithGoogle } from '@/lib/social-sign-in';
import { Icon } from '@/components/icon';
import { OwlMark } from '@/components/owl';
import { useTheme } from '@/theme/use-theme';

type Mode = 'email' | 'demo';
type Status = 'idle' | 'sending' | 'code-sent' | 'verifying' | 'signing-in' | 'social' | 'error';

// The website's checks (src/pages/LoginPage.tsx).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_CODE_PATTERN = /^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Email code and demo code, as on the website, then Sign in with Apple and
 * Google where the build can finish them (social-sign-in.ts). Apple's button
 * comes first and is Apple's own, as App Review asks of an app that offers
 * Google too.
 */
export default function SignInScreen() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // On iPad the form sits in the middle of the screen instead of under the status bar.
  const centred = useWindowDimensions().width >= 700;
  const { signInWithEmailOtp, verifyEmailOtp, signInWithDemoCode, sessionExpired } = useAuth();
  const [mode, setMode] = useState<Mode>('email');
  const [status, setStatus] = useState<Status>('idle');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCode, setDemoCode] = useState('');
  // A translation key, translated at render so it follows the language.
  const [error, setError] = useState('');
  const otpRef = useRef<TextInput>(null);

  const busy = status === 'sending' || status === 'verifying' || status === 'signing-in' || status === 'social';
  const [apple, setApple] = useState(false);
  const google = googleSignInAvailable();

  useEffect(() => {
    let live = true;
    void appleSignInAvailable().then((available) => {
      if (live) setApple(available);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (codeSent) otpRef.current?.focus();
  }, [codeSent]);

  const fail = (key: string) => {
    setStatus('error');
    setError(key);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus('idle');
    setError('');
    setOtp('');
    setCodeSent(false);
  };

  const sendCode = async () => {
    const normalized = email.trim();
    if (!EMAIL_PATTERN.test(normalized)) return fail('login.invalidEmail');
    setError('');
    setStatus('sending');
    try {
      await signInWithEmailOtp(normalized);
      setOtp('');
      setCodeSent(true);
      setStatus('code-sent');
    } catch (cause) {
      fail(signInErrorKey(cause, 'login.emailOtpError'));
    }
  };

  const verifyCode = async () => {
    const normalized = otp.trim();
    if (!/^\d{6}$/.test(normalized)) return fail('login.invalidCode');
    setError('');
    setStatus('verifying');
    try {
      await verifyEmailOtp(email, normalized);
    } catch (cause) {
      fail(signInErrorKey(cause, 'login.verifyOtpError'));
    }
  };

  const signInWithDemo = async () => {
    const normalized = demoCode.trim().toUpperCase().replace(/\s+/g, '');
    if (!DEMO_CODE_PATTERN.test(normalized)) return fail('login.invalidDemoCode');
    setError('');
    setStatus('signing-in');
    try {
      await signInWithDemoCode(normalized);
    } catch (cause) {
      fail(signInErrorKey(cause, 'login.demoError'));
    }
  };

  const social = async (provider: () => Promise<'signed-in' | 'cancelled'>) => {
    setError('');
    setStatus('social');
    try {
      // Signed in, the auth provider moves on from this screen.
      if ((await provider()) === 'cancelled') setStatus('idle');
    } catch (cause) {
      console.warn('Social sign-in failed:', cause instanceof Error ? cause.message : cause);
      fail(signInErrorKey(cause, 'mobile.signIn.socialError'));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          centred && styles.centred,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}>
        <OwlMark size={64} />
        <View style={styles.heading}>
          <Text accessibilityRole="header" weight="display" style={styles.title}>
            {t('login.title')}
          </Text>
          <Text tone="secondary" style={styles.subtitle}>
            {t('mobile.signIn.subtitle')}
          </Text>
        </View>

        <SegmentedControl
          options={[
            { value: 'email', label: t('login.emailTab') },
            { value: 'demo', label: t('login.demoTab') },
          ]}
          value={mode}
          onChange={switchMode}
          disabled={busy}
        />

        {mode === 'email' && !codeSent ? (
          <View style={styles.form}>
            <Field
              label={t('login.emailLabel')}
              hint={t('login.emailHint')}
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              invalid={status === 'error'}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={254}
              returnKeyType="send"
              onSubmitEditing={() => void sendCode()}
              editable={!busy}
            />
            <MainActionButton
              label={status === 'sending' ? t('login.sendingCode') : t('login.sendCode')}
              busy={status === 'sending'}
              onPress={() => void sendCode()}
            />
          </View>
        ) : null}

        {mode === 'email' && codeSent ? (
          <View style={styles.form}>
            <Field
              ref={otpRef}
              label={t('login.otpLabel')}
              hint={t('login.codeSentDesc')}
              placeholder={t('login.verificationCodePlaceholder')}
              value={otp}
              onChangeText={setOtp}
              invalid={status === 'error'}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => void verifyCode()}
              editable={!busy}
            />
            <MainActionButton
              label={status === 'verifying' ? t('login.verifying') : t('login.verifyCode')}
              busy={status === 'verifying'}
              onPress={() => void verifyCode()}
            />
            <View style={styles.secondary}>
              <TextButton label={t('login.useDifferentEmail')} disabled={busy} onPress={() => switchMode('email')} />
              <TextButton
                label={status === 'sending' ? t('login.resendingCode') : t('login.resendCode')}
                disabled={busy}
                onPress={() => void sendCode()}
              />
            </View>
          </View>
        ) : null}

        {mode === 'demo' ? (
          <View style={styles.form}>
            <Field
              label={t('login.demoCodeLabel')}
              hint={t('login.demoCodeHint')}
              placeholder={t('login.demoCodePlaceholder')}
              value={demoCode}
              onChangeText={setDemoCode}
              invalid={status === 'error'}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={14}
              returnKeyType="go"
              onSubmitEditing={() => void signInWithDemo()}
              editable={!busy}
            />
            <MainActionButton
              label={status === 'signing-in' ? t('login.signingIn') : t('login.signInWithDemoCode')}
              busy={status === 'signing-in'}
              onPress={() => void signInWithDemo()}
            />
          </View>
        ) : null}

        {(apple || google) && !codeSent ? (
          <View style={styles.form}>
            <View style={styles.divider} accessibilityRole="text">
              <View style={[styles.rule, { backgroundColor: colors.line }]} />
              <Text tone="secondary" weight="semibold" style={styles.dividerText}>
                {t('login.orContinueWith')}
              </Text>
              <View style={[styles.rule, { backgroundColor: colors.line }]} />
            </View>
            {apple ? (
              <View pointerEvents={busy ? 'none' : 'auto'} style={busy ? styles.dimmed : undefined}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={16}
                  style={styles.appleButton}
                  onPress={() => void social(signInWithApple)}
                />
              </View>
            ) : null}
            {google ? <SecondaryButton label={t('login.google')} disabled={busy} onPress={() => void social(signInWithGoogle)} testID="google-sign-in" /> : null}
          </View>
        ) : null}

        {sessionExpired && status !== 'code-sent' ? (
          // The website's login notice after the server ended the session; it goes once a sign-in succeeds.
          <View style={[styles.notice, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]} accessibilityRole="alert" testID="session-expired">
            <Icon name="alert" color={colors.primary} size={18} />
            <Text weight="medium" style={[styles.message, styles.noticeText, { color: colors.tileText }]}>
              {t('login.sessionExpired')}
            </Text>
          </View>
        ) : null}
        {status === 'code-sent' ? (
          // Success is mint and always comes with a check mark, as on the website.
          <View style={styles.success} accessibilityRole="alert">
            <View style={styles.successMark}>
              <SuccessCheck size={22} />
            </View>
            <Text weight="medium" style={[styles.message, styles.successText, { color: colors.success }]}>
              {t('login.codeSent')}
            </Text>
          </View>
        ) : null}
        {status === 'error' && error ? (
          <Text accessibilityRole="alert" weight="medium" style={[styles.message, { color: colors.destructive }]}>
            {t(error)}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  success: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  successMark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  successText: { flex: 1 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 2, borderRadius: 14, padding: 12 },
  noticeText: { flex: 1 },
  root: { flex: 1 },
  // Phone-width on iPad, centred.
  content: { paddingHorizontal: 24, gap: 24, width: '100%', maxWidth: 460, alignSelf: 'center' },
  centred: { flexGrow: 1, justifyContent: 'center' },
  heading: { gap: 8 },
  title: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  form: { gap: 18 },
  secondary: { gap: 2 },
  message: { fontSize: 15, lineHeight: 21 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 2, borderRadius: 1 },
  dividerText: { fontSize: 14 },
  appleButton: { height: 52 },
  dimmed: { opacity: 0.5 },
});
