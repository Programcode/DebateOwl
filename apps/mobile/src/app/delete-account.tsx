import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { Text } from '@/components/text';
import { deleteAccount, deletionConfirmation } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme/use-theme';

/** Removes what this device kept for the account: its settings. */
async function forgetAccount(userId: string) {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((key) => key.includes(userId)));
}

/** Deletes the account after the same typed confirmation as the website (rule 5.1.1(v)). */
export default function DeleteAccountSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const email = session?.user.email;
  const expected = deletionConfirmation(email);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    if (confirmation !== expected || deleting) return;
    const userId = session?.user.id;
    setDeleting(true);
    setFailed(false);
    try {
      await deleteAccount(confirmation);
    } catch (cause) {
      // The server's message is English and not meant for students; the sheet shows translated text only.
      console.warn('Could not delete the account:', cause instanceof Error ? cause.message : cause);
      setDeleting(false);
      setFailed(true);
      return;
    }
    if (userId) await forgetAccount(userId).catch(() => undefined);
    // The account is gone, so the server sign-out may fail; signOut still ends the session here.
    await signOut();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text accessibilityRole="header" weight="bold" style={styles.title}>
            {t('settings.deleteAccountDialogTitle')}
          </Text>
          <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={deleting} />
        </View>
        <Text tone="secondary" style={styles.body} testID="account-email">
          {t('settings.deleteAccountDialogDesc', { email: email || t('settings.unknownUser') })}
        </Text>
        <Field
          label={email ? t('settings.typeEmailConfirm') : t('settings.typeDeleteConfirm')}
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder={expected}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          keyboardType={email ? 'email-address' : 'default'}
          editable={!deleting}
          returnKeyType="done"
          onSubmitEditing={() => void remove()}
        />
        {failed ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text weight="semibold" style={[styles.body, { color: colors.destructive }]}>
              {t('settings.deleteAccountFailed')}
            </Text>
            <Text style={[styles.body, { color: colors.destructive }]}>
              {t('mobile.deleteAccount.failedHint')}
            </Text>
          </View>
        ) : null}
        <PrimaryButton
          destructive
          label={deleting ? t('settings.deletingAccount') : t('settings.deleteAccount')}
          busy={deleting}
          disabled={confirmation !== expected}
          onPress={() => void remove()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 18, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  error: { gap: 2 },
});
