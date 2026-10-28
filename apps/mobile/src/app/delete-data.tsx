import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton, TextButton } from '@/components/buttons';
import { Field } from '@/components/field';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { clearAllData } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { showNotice } from '@/lib/confirm';
import { useDebates } from '@/lib/debate-context';
import { forgetSessionMemory } from '@/lib/session-memory';
import { useTheme } from '@/theme/use-theme';

/**
 * The website's Delete all my data (SettingsPage.tsx): the student types their
 * email, then clear_current_user_data deletes their saved work, sources and
 * debates. Settings and the account stay.
 */
export default function DeleteDataSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { refresh, forgetDebates } = useDebates();
  const userId = session?.user.id ?? null;
  const email = session?.user.email;
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  // Nothing lands after an account change or after the sheet closes.
  const owner = useRef(userId);
  const live = useRef(true);
  useEffect(() => {
    owner.current = userId;
  }, [userId]);
  useEffect(() => () => {
    live.current = false;
  }, []);

  const matches = Boolean(email) && confirmation === email;

  const remove = async () => {
    const forUser = owner.current;
    if (!matches || deleting || !forUser) return;
    setDeleting(true);
    setFailed(false);
    try {
      await clearAllData(forUser);
    } catch (cause) {
      // The server's message is English and not meant for students; the sheet shows translated text only.
      console.warn('Could not delete the data:', cause instanceof Error ? cause.message : cause);
      if (live.current && owner.current === forUser) {
        setDeleting(false);
        setFailed(true);
      }
      return;
    }
    if (owner.current !== forUser) return;
    // As the website clears its stores: this session's results and drafts, one-off mode, and the debates, now
    // gone. They are cleared here first, so a reload that fails leaves nothing deleted on screen or targeted.
    forgetSessionMemory();
    forgetDebates(forUser);
    void refresh();
    showNotice(t('settings.deleteSuccess'), t('settings.deleteSuccessDesc'));
    if (live.current) router.back();
  };

  return (
    <SheetScrollView>
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('settings.deleteDialogTitle')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} disabled={deleting} />
      </View>
      <Text tone="secondary" style={styles.body} testID="account-email">
        {t('settings.deleteDialogDesc', { email: email ?? '' })}
      </Text>
      <Field
        label={t('settings.typeEmailConfirm')}
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder={email ?? ''}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="email-address"
        editable={!deleting}
        returnKeyType="done"
        onSubmitEditing={() => void remove()}
        testID="delete-data-confirmation"
      />
      {failed ? (
        <View accessibilityRole="alert" style={styles.error}>
          <Text weight="semibold" style={[styles.body, { color: colors.destructive }]}>
            {t('settings.deleteFailed')}
          </Text>
          <Text style={[styles.body, { color: colors.destructive }]}>{t('settings.deleteFailedDesc')}</Text>
        </View>
      ) : null}
      <PrimaryButton
        destructive
        label={t('settings.deleteAllData')}
        busy={deleting}
        disabled={!matches}
        onPress={() => void remove()}
      />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  error: { gap: 2 },
});
