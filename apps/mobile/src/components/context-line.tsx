import type { DebateContextFeature, DebateContextSide } from '@debatelab/core/contract/debate-context';
import type { DebateContextPlan } from '@debatelab/core/debate/context-plan';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from './buttons';
import { Text } from './text';

import { useContextPlan } from '@/lib/context-plan';
import { useDebates } from '@/lib/debate-context';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

function listFormat(language: string, parts: string[]): string {
  try {
    return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(parts);
  } catch {
    return parts.join(', ');
  }
}

/** The website's summary: "Using 3 sources and 2 results: Case (In favor), Attack". */
export function contextSummary(plan: DebateContextPlan, t: TFunction, language: string): { text: string; names: string } {
  // "Sent" means it reaches the model; anything chosen but over the limit or too large did not fit.
  const sent = (item: { included: boolean; overLimit: boolean; omittedForSize: boolean }) => item.included && !item.overLimit && !item.omittedForSize;
  const chosenSources = plan.sources.filter((source) => source.included).length;
  const sentSources = plan.sources.filter(sent).length;
  const chosenOutputs = plan.outputs.filter((output) => output.included && !output.empty);
  const sentOutputs = chosenOutputs.filter(sent);
  const count = (key: 'sourceCount' | 'resultCount', used: number, chosen: number) => used === chosen
    ? t(`debateContext.${key}`, { count: used })
    : `${t(`debateContext.${key}Of`, { used, count: chosen })} ${t('debateContext.didntFit', { count: chosen - used })}`;
  const parts = [
    chosenSources > 0 && count('sourceCount', sentSources, chosenSources),
    chosenOutputs.length > 0 && count('resultCount', sentOutputs.length, chosenOutputs.length),
  ].filter((part): part is string => Boolean(part));
  const names = sentOutputs.map((output) => output.side === 'pro' || output.side === 'con'
    ? t('debateContext.resultName', { kind: t(`debate.kinds.${output.ref.kind}`), side: t(`debate.side.${output.side}`) })
    : t(`debate.kinds.${output.ref.kind}`));
  return {
    text: parts.length > 0 ? t('debateContext.using', { list: listFormat(language, parts) }) : t('debateContext.usingMotionOnly'),
    names: names.join(', '),
  };
}

/**
 * The website's DebateContextControl: the line above a form's main button
 * that says which Current Debate material the next request sends, with
 * Review to change it for that request. One-off work sends none, and the
 * one-off notice already says so.
 */
export function ContextLine({
  feature,
  side,
  debateId: debateIdOverride,
  excludeChatId,
  includeSources,
}: {
  feature: DebateContextFeature;
  side: DebateContextSide;
  /** The debate the request uses when it is not the Current Debate, such as a reopened chat. */
  debateId?: string | null;
  excludeChatId?: string | null;
  includeSources?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { activeDebateId } = useDebates();
  const debateId = debateIdOverride !== undefined ? debateIdOverride : activeDebateId;
  const plan = useContextPlan(feature, side, debateId, { excludeChatId, includeSources });
  if (!debateId || !plan) return null;
  const summary = contextSummary(plan, t, i18n.resolvedLanguage ?? 'en');
  return (
    <View style={[styles.line, { borderColor: colors.tileBorder, backgroundColor: colors.tile }]} testID="debate-context-line">
      <Text style={styles.text}>
        <Text weight="semibold" style={styles.text}>
          {summary.text}
        </Text>
        {summary.names ? (
          <Text tone="secondary" style={styles.text}>
            {`: ${summary.names}`}
          </Text>
        ) : null}
      </Text>
      <TextButton
        label={t('debateContext.review')}
        onPress={() =>
          router.push({
            pathname: '/context-review',
            params: {
              feature,
              side,
              debate: debateId,
              ...(excludeChatId ? { exclude: excludeChatId } : {}),
              ...(includeSources === false ? { sources: 'off' } : {}),
            },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: radius.field, paddingLeft: 14, paddingRight: 10, paddingVertical: 8 },
  text: { flex: 1, fontSize: 14.5, lineHeight: 20 },
});
