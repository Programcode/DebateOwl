import type { LiveGeneration, LivePhase } from '@debatelab/core/ai/live';
import type { DraftBlock, DraftSection } from '@debatelab/core/ai/live-sections';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, View } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { TextButton } from './buttons';
import { OwlAvatar, useReduceMotion, type OwlPose } from './owl';
import { Text } from './text';
import { ToolProgress } from './tool-form';

import { SPRING } from '@/theme/motion';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * A tool's answer while the model writes it, as the website's LiveToolRun
 * (src/components/features/tools/live-draft.tsx): what the run is doing and
 * for how long, then the sections written so far in the result's own words,
 * with a caret where text is arriving.
 */

/** What the model has written so far in the screen's current run. */
export interface LiveRunState {
  phase?: LivePhase;
  draft?: Record<string, unknown>;
}

/** One screen's live run: `begin` hands the request its updates; a later `begin` or `end` silences them. */
export function useLiveRun() {
  const [state, setState] = useState<LiveRunState>({});
  const run = useRef(0);
  const live = useRef(true);
  useEffect(() => () => {
    live.current = false;
  }, []);

  const begin = useCallback((): LiveGeneration => {
    const id = ++run.current;
    setState({});
    const current = () => live.current && run.current === id;
    return {
      onDraft: (draft) => {
        if (current()) setState((previous) => ({ ...previous, phase: 'writing', draft }));
      },
      onPhase: (phase) => {
        if (current()) setState((previous) => ({ ...previous, phase }));
      },
    };
  }, []);

  const end = useCallback(() => {
    run.current += 1;
    if (live.current) setState({});
  }, []);

  return { state, begin, end };
}

/** Whole seconds since the run started, as the website's useElapsedSeconds. */
export function useElapsedSeconds() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return elapsed;
}

/** The status line for a phase that writes nothing yet, or the tool's own label. */
function usePhaseLabel(phase: LivePhase | undefined, fallback: string): string {
  const { t } = useTranslation();
  if (phase === 'research') return t('tools.live.researching');
  if (phase === 'checking') return t('tools.live.checking');
  if (phase === 'writing') return t('tools.live.writing');
  return fallback;
}

/** A blinking bar where the model is writing; steady under Reduce Motion, as on the website. */
function Caret() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no" style={[styles.caret, { backgroundColor: colors.primaryFill, opacity }]} testID="live-caret" />;
}

function Block({ block, writing }: { block: DraftBlock; writing: boolean }) {
  const { colors } = useTheme();
  if (block.heading) {
    return (
      <View style={styles.inline}>
        <Text accessibilityRole="header" weight="bold" style={styles.heading}>
          {block.heading}
        </Text>
        {writing ? <Caret /> : null}
      </View>
    );
  }
  return (
    <View style={styles.block}>
      {/* Result labels read "Reasoning:" inline; as a heading the colon goes. */}
      {block.label ? (
        <Text weight="semibold" tone="faint" style={styles.label}>
          {block.label.replace(/[:：]\s*$/, '').toLocaleUpperCase()}
        </Text>
      ) : null}
      {block.items ? (
        block.items.map((item, index) => (
          <View key={index} style={styles.bullet}>
            <Text weight="bold" style={[styles.marker, { color: colors.primary }]}>
              •
            </Text>
            <View style={[styles.inline, styles.bulletText]}>
              <Text style={styles.body}>{item}</Text>
              {writing && index === block.items!.length - 1 ? <Caret /> : null}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.inline}>
          <Text style={styles.body}>{block.text}</Text>
          {writing ? <Caret /> : null}
        </View>
      )}
    </View>
  );
}

/**
 * Before any text: the tool's owl, the phase or the tool's own line, the
 * elapsed time and Cancel. Then a strip that says it is writing live, and
 * one card per section written so far.
 */
export function LiveToolRun({
  label,
  run,
  sections,
  detail,
  onCancel,
  pose,
}: {
  label: string;
  run: LiveRunState;
  sections: DraftSection[];
  detail?: string;
  onCancel: () => void;
  /** The tool's own owl before the answer starts; the phase picks it otherwise. */
  pose?: OwlPose;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = usePhaseLabel(run.phase, label);
  const elapsed = useElapsedSeconds();
  // The owl looks things up while researching or checking sources, as on the website.
  if (sections.length === 0) {
    const looking = run.phase === 'research' || run.phase === 'checking';
    return <ToolProgress pose={looking ? 'skeptical' : pose ?? 'idea'} messages={[status]} detail={detail} elapsed={elapsed} onCancel={onCancel} />;
  }

  const writing = run.phase === 'writing';
  const lastSection = sections.length - 1;
  const lastBlock = sections[lastSection].blocks.length - 1;
  return (
    <View style={styles.root} testID="live-draft">
      <View style={[styles.strip, { backgroundColor: colors.tile, borderColor: colors.tileBorder }]}>
        <OwlAvatar pose={writing ? 'point' : 'idea'} size={36} blink />
        <View style={styles.stripText}>
          <Text weight="bold" style={styles.stripStatus} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
            {writing ? t('tools.live.writingLive') : status}
          </Text>
          {elapsed >= 5 ? (
            <Text tone="faint" style={styles.elapsed}>
              {t('tools.elapsed', { seconds: elapsed })}
            </Text>
          ) : null}
        </View>
        <TextButton label={t('common.cancel')} onPress={onCancel} />
      </View>
      {/* Each section pops in as the draft starts writing it (Reanimated; still under Reduce Motion). */}
      {sections.map((section, sectionIndex) => (
        <Reanimated.View
          key={section.id}
          entering={FadeInDown.springify().damping(SPRING.pop.damping).stiffness(SPRING.pop.stiffness)}
          accessibilityLabel={section.title}
          style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text accessibilityRole="header" weight="display" tone="heading" style={styles.sectionTitle}>
            {section.title}
          </Text>
          {section.blocks.map((block, blockIndex) => (
            <Block key={blockIndex} block={block} writing={writing && sectionIndex === lastSection && blockIndex === lastBlock} />
          ))}
        </Reanimated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, marginTop: 4 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: radius.field, paddingHorizontal: 12, paddingVertical: 9 },
  stripText: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  stripStatus: { fontSize: 15, lineHeight: 20 },
  elapsed: { fontSize: 14, fontVariant: ['tabular-nums'] },
  section: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, lineHeight: 23 },
  block: { gap: 4 },
  label: { fontSize: 12, letterSpacing: 0.6 },
  heading: { fontSize: 15.5, lineHeight: 22, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 22, flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  bullet: { flexDirection: 'row', gap: 8 },
  marker: { fontSize: 15, lineHeight: 22 },
  bulletText: { flex: 1 },
  caret: { width: 3, height: 17, borderRadius: 2, marginLeft: 2, marginBottom: 3 },
});
