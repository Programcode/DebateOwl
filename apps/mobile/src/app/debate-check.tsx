import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton, SecondaryButton } from '@/components/buttons';
import { Owl } from '@/components/owl';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useDebates } from '@/lib/debate-context';
import { formatRelativeDate } from '@/lib/dates';
import { useLatest } from '@/lib/live-value';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/use-theme';

/**
 * The website's InactiveDebateGate: "Still preparing this debate?" with
 * Continue, Switch debate and Start new debate. Closing the sheet counts as
 * Continue, as Escape does on the website, so it never traps the student.
 */
export default function DebateCheckSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { current, continueCurrent } = useDebates();
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState('');
  const answered = useRef(false);
  const latest = useLatest(continueCurrent);

  useEffect(() => () => {
    if (!answered.current) latest.current().catch(() => {});
  }, [latest]);

  const keep = async () => {
    if (continuing) return;
    setContinuing(true);
    setError('');
    try {
      await continueCurrent();
      answered.current = true;
      haptics.success();
      router.back();
    } catch {
      haptics.warning();
      setError(t('debate.continueFailed'));
      setContinuing(false);
    }
  };
  const go = (href: '/debates' | '/new-debate') => {
    answered.current = true;
    router.replace(href);
  };

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="debate-check-sheet">
      <Owl pose="sleepy" size={92} style={styles.owl} />
      <Text accessibilityRole="header" weight="display" style={styles.title}>
        {t('debate.gateTitle')}
      </Text>
      {current ? (
        <View style={styles.text}>
          <Text weight="semibold" style={styles.motion}>
            {current.motion}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {t('debate.gateDesc', { when: formatRelativeDate(current.lastActivityAt) })}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" weight="medium" style={[styles.body, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
      <MainActionButton label={t('debate.continue')} busy={continuing} onPress={() => void keep()} />
      <SecondaryButton icon="list" label={t('debate.switch')} onPress={() => go('/debates')} />
      <SecondaryButton icon="plus" label={t('debate.startNew')} onPress={() => go('/new-debate')} />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  owl: { alignSelf: 'center' },
  title: { fontSize: 23, lineHeight: 29, letterSpacing: -0.4, textAlign: 'center' },
  text: { gap: 6, alignItems: 'center' },
  motion: { fontSize: 17, lineHeight: 23, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
