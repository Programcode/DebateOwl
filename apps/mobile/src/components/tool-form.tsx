import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TextButton } from './buttons';
import { Text } from './text';

import type { AIErrorKind } from '@/lib/ai-request';
import { useDebates } from '@/lib/debate-context';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The tool's large title and the line under it. */
export function ToolTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" weight="bold" style={styles.title}>
        {title}
      </Text>
      <Text tone="secondary" style={styles.subtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

/** Where new work will be saved, as the website's CurrentDebateStrip says it. */
export function WorkingIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { current, oneOff } = useDebates();
  return (
    <View style={[styles.strip, { borderColor: colors.border }, oneOff && styles.dashed]} testID="working-in">
      {oneOff ? (
        <Text tone="secondary" style={styles.stripText}>
          {t('debate.oneOffStrip')}
        </Text>
      ) : current ? (
        <Text tone="secondary" style={styles.stripText} numberOfLines={2}>
          {`${t('debate.workingIn')} `}
          <Text weight="semibold" style={styles.stripText}>
            {current.motion}
          </Text>
        </Text>
      ) : (
        <Text tone="secondary" style={styles.stripText}>
          {t('debate.noCurrentStrip')}
        </Text>
      )}
    </View>
  );
}

const PLAN_ERRORS = new Set<AIErrorKind>(['trialExpired', 'limitReached', 'modelRestricted']);

/** Why a request failed, in the tool's words, with the way forward. */
export function ToolError({ title, error, onRetry }: { title: string; error: AIErrorKind | 'debate'; onRetry: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.border, backgroundColor: colors.card }]} testID="tool-error">
      <Text weight="semibold" style={styles.errorTitle}>
        {title}
      </Text>
      <Text tone="secondary" style={styles.errorBody}>
        {error === 'debate' ? t('debate.saveFailed') : t(`mobile.results.errors.${error}`)}
      </Text>
      <View style={styles.errorActions}>
        {error !== 'debate' && PLAN_ERRORS.has(error) ? (
          <TextButton label={t('mobile.ask.openYou')} onPress={() => router.navigate('/you')} />
        ) : (
          <TextButton label={t('common.retry')} onPress={onRetry} />
        )}
      </View>
    </View>
  );
}

/** A calm progress state that names what is happening, cycling the website's messages. */
export function ToolProgress({ messages, detail, onCancel }: { messages: string[]; detail?: string; onCancel: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => (value + 1) % messages.length), 3000);
    return () => clearInterval(timer);
  }, [messages.length]);
  return (
    <View style={[styles.progress, { borderColor: colors.border, backgroundColor: colors.card }]} testID="tool-progress">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text weight="semibold" style={styles.progressText} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        {messages[index]}
      </Text>
      {detail ? (
        <Text tone="faint" style={styles.progressDetail} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
      <TextButton label={t('common.cancel')} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 4, marginBottom: 2 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  subtitle: { fontSize: 16, lineHeight: 22 },
  strip: { borderWidth: 1, borderRadius: radius.field, paddingHorizontal: 14, paddingVertical: 10 },
  dashed: { borderStyle: 'dashed' },
  stripText: { fontSize: 14.5, lineHeight: 20 },
  error: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 4 },
  errorTitle: { fontSize: 16 },
  errorBody: { fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 20 },
  progress: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card + 2, paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center', gap: 12, marginTop: 8 },
  progressText: { fontSize: 18, lineHeight: 24, textAlign: 'center' },
  progressDetail: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
