import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainActionButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { mainActionGradient } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Mode = 'email' | 'demo';
type Status = 'idle' | 'sending' | 'code-sent' | 'verifying' | 'signing-in' | 'error';

// The website's checks (src/pages/LoginPage.tsx).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_CODE_PATTERN = /^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Email code and demo code, as on the website. Google sign-in needs an OAuth
 * redirect back into the app, which Expo Go cannot do, so it arrives with the
 * first development build; Sign in with Apple comes after that.
 */
export default function SignInScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // On iPad the form sits in the middle of the screen instead of under the status bar.
  const centred = useWindowDimensions().width >= 700;
  const { signInWithEmailOtp, verifyEmailOtp, signInWithDemoCode } = useAuth();
  const [mode, setMode] = useState<Mode>('email');
  const [status, setStatus] = useState<Status>('idle');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');
  const otpRef = useRef<TextInput>(null);

  const busy = status === 'sending' || status === 'verifying' || status === 'signing-in';

  useEffect(() => {
    if (codeSent) otpRef.current?.focus();
  }, [codeSent]);

  const fail = (message: string) => {
    setStatus('error');
    setError(message);
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
    if (!EMAIL_PATTERN.test(normalized)) return fail(t('login.invalidEmail'));
    setError('');
    setStatus('sending');
    try {
      await signInWithEmailOtp(normalized);
      setOtp('');
      setCodeSent(true);
      setStatus('code-sent');
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : t('login.emailOtpError'));
    }
  };

  const verifyCode = async () => {
    const normalized = otp.trim();
    if (!/^\d{6}$/.test(normalized)) return fail(t('login.invalidCode'));
    setError('');
    setStatus('verifying');
    try {
      await verifyEmailOtp(email, normalized);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : t('login.verifyOtpError'));
    }
  };

  const signInWithDemo = async () => {
    const normalized = demoCode.trim().toUpperCase().replace(/\s+/g, '');
    if (!DEMO_CODE_PATTERN.test(normalized)) return fail(t('login.invalidDemoCode'));
    setError('');
    setStatus('signing-in');
    try {
      await signInWithDemoCode(normalized);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : t('login.demoError'));
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
        <LinearGradient {...mainActionGradient} style={styles.logo}>
          <Icon name="sparkles" color="#ffffff" size={30} />
        </LinearGradient>
        <View style={styles.heading}>
          <Text accessibilityRole="header" weight="bold" style={styles.title}>
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

        {status === 'code-sent' ? (
          <Text accessibilityRole="alert" weight="medium" style={[styles.message, { color: colors.success }]}>
            {t('login.codeSent')}
          </Text>
        ) : null}
        {status === 'error' && error ? (
          <Text accessibilityRole="alert" weight="medium" style={[styles.message, { color: colors.destructive }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Phone-width on iPad, centred.
  content: { paddingHorizontal: 24, gap: 24, width: '100%', maxWidth: 460, alignSelf: 'center' },
  centred: { flexGrow: 1, justifyContent: 'center' },
  logo: { width: 60, height: 60, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  heading: { gap: 8 },
  title: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  form: { gap: 18 },
  secondary: { gap: 2 },
  message: { fontSize: 15, lineHeight: 21 },
});
