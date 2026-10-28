import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from './buttons';
import { OneOffNotice } from './one-off-notice';
import { Text } from './text';

import type { AIErrorKind } from '@/lib/ai-request';
import { useDailyUsage } from '@/lib/usage';
import { useDebates } from '@/lib/debate-context';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { OwlLoader, type OwlPose } from '@/components/owl';

/** The tool's large title, the line under it, and today's AI uses left, as the website's PageHeader. */
export function ToolTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" weight="display" style={styles.title}>
        {title}
      </Text>
      <Text tone="secondary" style={styles.subtitle}>
        {subtitle}
      </Text>
      <DailyUsageLine />
    </View>
  );
}

/** "3 of 5 AI uses left today"; nothing while the count is unknown or the plan has no daily uses. */
export function DailyUsageLine() {
  const { t } = useTranslation();
  const usage = useDailyUsage();
  if (!usage) return null;
  return (
    <Text tone="faint" style={styles.usage} testID="daily-usage">
      {t('dailyLimit.remaining', { count: usage.remaining, limit: usage.limit })}
    </Text>
  );
}

/** Where new work will be saved, as the website's CurrentDebateStrip says it. In one-off mode it offers the way back to the Current Debate. */
export function WorkingIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { current, oneOff } = useDebates();
  if (oneOff) return <OneOffNotice />;
  return (
    <View style={[styles.strip, { borderColor: colors.border }]} testID="working-in">
      {current ? (
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

/** A tool at work: the owl in the tool's pose, the website's progress line, the elapsed time once it matters, the request's subject and Cancel. */
export function ToolProgress({
  messages,
  detail,
  elapsed,
  onCancel,
  pose = 'thinking',
}: {
  messages: string[];
  detail?: string;
  /** Seconds since the request started; shown from 5, as the website's ToolRunStatus. */
  elapsed?: number;
  onCancel: () => void;
  pose?: OwlPose;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => (value + 1) % messages.length), 3000);
    return () => clearInterval(timer);
  }, [messages.length]);
  return (
    <View style={[styles.progress, { borderColor: colors.border, backgroundColor: colors.card }]} testID="tool-progress">
      <OwlLoader pose={pose} size={96} />
      <Text weight="display" style={styles.progressText} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        {messages[index]}
      </Text>
      {elapsed !== undefined && elapsed >= 5 ? (
        <Text tone="faint" style={styles.progressElapsed}>
          {t('tools.elapsed', { seconds: elapsed })}
        </Text>
      ) : null}
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
  usage: { fontSize: 14, lineHeight: 19, marginTop: 2 },
  strip: { borderWidth: 2, borderRadius: radius.field, paddingHorizontal: 14, paddingVertical: 10 },
  stripText: { fontSize: 14.5, lineHeight: 20 },
  error: { borderWidth: 2, borderRadius: radius.card, padding: 14, gap: 4 },
  errorTitle: { fontSize: 16 },
  errorBody: { fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 20 },
  progress: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.card + 2, paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center', gap: 12, marginTop: 8 },
  progressText: { fontSize: 18, lineHeight: 24, textAlign: 'center' },
  progressElapsed: { fontSize: 14, marginTop: -6, fontVariant: ['tabular-nums'] },
  progressDetail: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
