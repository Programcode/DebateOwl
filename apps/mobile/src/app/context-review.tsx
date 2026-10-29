import type { DebateContextFeature, DebateContextSide } from '@debatelab/core/contract/debate-context';
import type { ContextOutputItem, ContextSourceItem } from '@debatelab/core/debate/context-plan';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SecondaryButton, TextButton } from '@/components/buttons';
import { ListItemIn, SkeletonTextRows } from '@/components/card';
import { Icon } from '@/components/icon';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { hasContextChoices, PinLimitError, resetContextChoices, setOutputChoice, setSourceChoice, togglePin, useContextPlan } from '@/lib/context-plan';
import { useDebates } from '@/lib/debate-context';
import { haptics } from '@/lib/haptics';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const FEATURES = new Set<DebateContextFeature>(['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'crossfire', 'sparring']);
const SIDES = new Set<DebateContextSide>(['pro', 'con', 'both', 'neutral']);

function statusNote(item: { overLimit: boolean; omittedForSize: boolean; shortened?: boolean; empty?: boolean }, t: TFunction): string | null {
  if (item.overLimit) return t('debateContext.overLimit');
  if (item.omittedForSize) return t('debateContext.tooLarge');
  if (item.empty) return t('debateContext.empty');
  if (item.shortened) return t('debateContext.shortened');
  return null;
}

/**
 * The website's Review sheet (DebateContextReview): what the next request
 * uses, with each source and saved result switched on or off for that request
 * only, and up to three results pinned for every request in the debate.
 */
export default function ContextReviewSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ feature?: string; side?: string; debate?: string; exclude?: string; sources?: string }>();
  const feature = FEATURES.has(params.feature as DebateContextFeature) ? (params.feature as DebateContextFeature) : 'generate';
  const side = SIDES.has(params.side as DebateContextSide) ? (params.side as DebateContextSide) : 'both';
  const debateId = params.debate ?? null;
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { debates } = useDebates();
  const plan = useContextPlan(feature, side, debateId, { excludeChatId: params.exclude ?? null, includeSources: params.sources !== 'off' });
  const [pinning, setPinning] = useState<string | null>(null);
  const [pinError, setPinError] = useState('');
  const motion = debates.find((debate) => debate.id === debateId)?.motion;

  const pin = async (output: ContextOutputItem) => {
    if (!userId || !plan) return;
    const key = `${output.ref.kind}:${output.ref.id}`;
    setPinning(key);
    setPinError('');
    try {
      await togglePin(userId, plan.debateId, output.ref, plan.resultKeys);
    } catch (cause) {
      if (!(cause instanceof PinLimitError)) console.warn('Could not save the pin:', cause instanceof Error ? cause.message : cause);
      setPinError(cause instanceof PinLimitError ? t('debateContext.pinLimit') : t('debateContext.pinFailed'));
    } finally {
      setPinning(null);
    }
  };

  return (
    <SheetScrollView testID="context-review-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('debateContext.reviewTitle')}
        </Text>
        <TextButton label={t('mobile.common.done')} onPress={() => router.back()} />
      </View>
      <Text tone="secondary" style={styles.body}>
        {t('debateContext.reviewDesc')}
      </Text>

      {!plan ? (
        <SkeletonTextRows rows={4} />
      ) : (
        <>
          <View style={styles.section}>
            <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.heading}>
              {t('debateContext.debateHeading')}
            </Text>
            {motion ? <Text style={styles.body}>{motion}</Text> : null}
            <Text tone="secondary" style={styles.note}>
              {plan.policy.instructions ? t('debateContext.instructionsUsed') : t('debateContext.instructionsNotUsed')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.heading}>
              {t('debateContext.sourcesHeading')}
            </Text>
            {!plan.policy.sources ? (
              <Text tone="secondary" style={styles.note}>
                {plan.feature === 'sparring' ? t('debateContext.sparringNoSources') : t('debateContext.sourcesOff')}
              </Text>
            ) : plan.sources.length === 0 ? (
              <Text tone="secondary" style={styles.note}>
                {t('debateContext.noSources')}
              </Text>
            ) : (
              <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {plan.sources.map((source, index) => (
                  <ListItemIn key={source.id} index={index}>
                    <SourceRow source={source} first={index === 0} onChange={(include) => setSourceChoice(plan.feature, plan.debateId, source.id, include)} />
                  </ListItemIn>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" weight="bold" tone="heading" style={styles.heading}>
              {t('debateContext.resultsHeading')}
            </Text>
            {!plan.policy.outputs ? (
              <Text tone="secondary" style={styles.note}>
                {t('debateContext.sparringNoResults')}
              </Text>
            ) : plan.outputs.length === 0 ? (
              <Text tone="secondary" style={styles.note}>
                {t('debateContext.noResults')}
              </Text>
            ) : (
              <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {plan.outputs.map((output, index) => (
                  <ListItemIn key={`${output.ref.kind}:${output.ref.id}`} index={index}>
                    <OutputRow
                      output={output}
                      first={index === 0}
                      pinning={pinning === `${output.ref.kind}:${output.ref.id}`}
                      onChange={(include) => setOutputChoice(plan.feature, plan.debateId, output.ref, include)}
                      onPin={() => void pin(output)}
                    />
                  </ListItemIn>
                ))}
              </View>
            )}
            {pinError ? (
              <Text accessibilityRole="alert" style={[styles.note, { color: colors.destructive }]}>
                {pinError}
              </Text>
            ) : null}
          </View>

          {hasContextChoices(plan.feature) ? (
            <SecondaryButton label={t('debateContext.resetChoices')} icon="reset" onPress={() => resetContextChoices(plan.feature)} testID="debate-context-reset" />
          ) : null}
        </>
      )}
    </SheetScrollView>
  );
}

/** A checkbox row: the box is the website's checkbox, the whole row toggles it. */
function CheckRow({ checked, label, meta, note, first, onChange, trailing }: {
  checked: boolean;
  label: string;
  meta?: string;
  note?: string | null;
  first: boolean;
  onChange: (checked: boolean) => void;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={() => {
          haptics.tap();
          onChange(!checked);
        }}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <View style={[styles.box, checked ? { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill } : { borderColor: colors.inputBorder }]}>
          {checked ? <Icon name="check" color={colors.onPrimary} size={14} /> : null}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          {meta ? (
            <Text tone="faint" style={styles.rowMeta}>
              {meta}
            </Text>
          ) : null}
          {note ? (
            <Text tone="faint" style={styles.rowMeta}>
              {note}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

function SourceRow({ source, first, onChange }: { source: ContextSourceItem; first: boolean; onChange: (include: boolean) => void }) {
  const { t } = useTranslation();
  const note = source.included ? statusNote(source, t) : !source.active ? t('debateContext.inactive') : null;
  return <CheckRow checked={source.included} label={source.title} note={note} first={first} onChange={onChange} />;
}

function OutputRow({ output, first, pinning, onChange, onPin }: {
  output: ContextOutputItem;
  first: boolean;
  pinning: boolean;
  onChange: (include: boolean) => void;
  onPin: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const kind = t(`debate.kinds.${output.ref.kind}`);
  const title = output.title || kind;
  const meta = `${output.side ? t('debateContext.resultMeta', { kind, side: t(`debate.side.${output.side}`) }) : kind}${output.pinned ? `, ${t('debateContext.pinned')}` : ''}`;
  return (
    <CheckRow
      checked={output.included}
      label={title}
      meta={meta}
      note={output.included ? statusNote(output, t) : null}
      first={first}
      onChange={onChange}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: output.pinned, disabled: pinning }}
          accessibilityLabel={output.pinned ? t('debateContext.unpinAria', { title }) : t('debateContext.pinAria', { title })}
          disabled={pinning}
          hitSlop={6}
          onPress={() => {
            haptics.tap();
            onPin();
          }}
          style={({ pressed }) => [styles.pin, output.pinned && { backgroundColor: colors.tile }, pressed && styles.pressed]}
          testID="debate-context-pin">
          {pinning ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="pin" color={output.pinned ? colors.primary : colors.secondary} size={18} />}
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  section: { gap: 8 },
  heading: { fontSize: 16 },
  note: { fontSize: 14.5, lineHeight: 20 },
  group: { borderWidth: 2, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15.5, lineHeight: 21 },
  rowMeta: { fontSize: 13.5, lineHeight: 18 },
  pin: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
