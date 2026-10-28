import { BUILT_IN_FORMAT_IDS, FORMATS, formatDuration, type RoundSegment } from '@debatelab/core/free-tools/formats';
import {
  clockFace,
  goToSegment,
  initialRoundState,
  isPrepRunning,
  isSpeechRunning,
  prepRemainingMs,
  resetPrep,
  resetSpeech,
  togglePrep,
  toggleSpeech,
  type PrepSide,
} from '@debatelab/core/free-tools/round-timer';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionMenu, type MenuItem } from '@/components/action-menu';
import { TextButton } from '@/components/buttons';
import { Icon } from '@/components/icon';
import { LiveTopBar, MainRoundControl, RoundIconButton, SideControl } from '@/components/round-controls';
import { Text } from '@/components/text';
import { TimerRing } from '@/components/timer-ring';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { useLayoutClass } from '@/lib/layout';
import { formatFor, formatName, sideNameFor, speechStatus, type FormatChoice, type TimerSession, type Translate } from '@/lib/timer';
import { useKeepAwakeWhile } from '@/lib/timer-signals';
import { deleteSavedFormat, updateSession, useTimerStore } from '@/lib/timer-store';
import { useTheme } from '@/theme/use-theme';

const TICK_MS = 250;

// The website's side colours (sky for the first side, rose for the second), at the app's contrast.
const SIDE_COLORS = {
  light: { a: '#0A6FF0', b: '#D6456B', both: '#5F708A' },
  dark: { a: '#4CA6FD', b: '#FF8AA8', both: '#8E9FB6' },
} as const;

/**
 * The debate timer, as the website's free round timer: every format it has
 * (Public Forum to World Schools and Asian Parliamentary), each speech with
 * its points-of-information window, prep banks for both sides, overtime and
 * grace, and custom formats saved on the device. The clock lives in
 * timer-store.ts and the signals in TimerRunner, so closing this screen
 * leaves a running speech running, on the Lock Screen too.
 */
export default function TimerScreen() {
  const { t } = useTranslation();
  const tools: Translate = (key, options) => t(key, { ns: 'tools', ...options });
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const layout = useLayoutClass();
  const { colors, scheme } = useTheme();
  const { session, saved } = useTimerStore();
  const [now, setNow] = useState(() => Date.now());
  const [menu, setMenu] = useState(false);

  const { round, muted, choice } = session;
  const { format, segment, elapsed, remainingMs, overtime, inGrace, poi } = speechStatus(session, now);
  const speechRunning = isSpeechRunning(round);
  const prepRunning = isPrepRunning(round, 'a') || isPrepRunning(round, 'b');
  useKeepAwakeWhile(speechRunning || prepRunning);

  // The clock reads the time from timestamps; the tick only redraws it.
  useEffect(() => {
    setNow(Date.now());
    if (!speechRunning && !prepRunning) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [speechRunning, prepRunning]);

  const change = (next: (current: TimerSession) => TimerSession) => {
    updateSession(next);
    setNow(Date.now());
  };
  const toggle = () => {
    haptics.tap();
    change((current) => ({ ...current, round: toggleSpeech(current.round, Date.now()) }));
  };
  const reset = () => change((current) => ({ ...current, round: resetSpeech(current.round) }));
  const go = (index: number) => {
    if (index !== round.segmentIndex) haptics.select();
    change((current) => ({ ...current, round: goToSegment(current.round, formatFor(current.choice), index, Date.now()) }));
  };
  const prep = (side: PrepSide) => {
    haptics.tap();
    change((current) => ({ ...current, round: togglePrep(current.round, side, Date.now()) }));
  };
  const choose = (next: FormatChoice) => change((current) => ({ ...current, choice: next, round: initialRoundState(formatFor(next)) }));

  const name = formatName(choice, format, t);
  const savedId = choice.id === 'custom' ? choice.savedId : undefined;
  const menuItems: MenuItem[] = [
    ...BUILT_IN_FORMAT_IDS.map((id) => ({
      key: `builtin:${id}`,
      label: formatName({ id }, FORMATS[id], t),
      icon: choice.id === id ? ('check' as const) : undefined,
    })),
    ...saved.map((item) => ({ key: `saved:${item.id}`, label: item.format.name, icon: item.id === savedId ? ('check' as const) : undefined })),
    { key: 'new', label: tools('custom.open'), icon: 'plus' },
    ...(choice.id === 'custom' ? [{ key: 'edit', label: t('mobile.timer.editFormat'), icon: 'pencil' as const }] : []),
    ...(savedId ? [{ key: 'delete', label: t('mobile.timer.deleteFormat'), icon: 'trash' as const, destructive: true }] : []),
  ];
  const onMenu = async (key: string) => {
    if (key.startsWith('builtin:')) {
      const id = BUILT_IN_FORMAT_IDS.find((entry) => `builtin:${entry}` === key);
      if (id && choice.id !== id) choose({ id });
    } else if (key.startsWith('saved:')) {
      const item = saved.find((entry) => `saved:${entry.id}` === key);
      if (item && item.id !== savedId) choose({ id: 'custom', custom: item.format, savedId: item.id });
    } else if (key === 'new' || key === 'edit') {
      router.push({ pathname: '/timer-format', params: { mode: key } });
    } else if (key === 'delete' && savedId) {
      const confirmed = await confirmDestructive({
        title: t('mobile.timer.deleteFormatTitle', { name }),
        message: t('mobile.timer.deleteFormatMessage'),
        confirm: t('common.delete'),
        cancel: t('common.cancel'),
      });
      if (!confirmed) return;
      deleteSavedFormat(savedId);
      // The round keeps its format; it is just no longer saved.
      change((current) => (current.choice.id === 'custom' ? { ...current, choice: { id: 'custom', custom: current.choice.custom } } : current));
    }
  };

  const face = clockFace(remainingMs);
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const warning = overtime || (secondsLeft <= 30 && (speechRunning || elapsed > 0));
  const status = overtime
    ? tools(inGrace ? 'timer.grace' : 'timer.overtime')
    : speechRunning ? tools('timer.running') : elapsed > 0 ? tools('timer.paused') : tools('timer.ready');
  const sideColors = SIDE_COLORS[scheme];
  const sideName = sideNameFor(choice, format, segment.side, t);
  const isLast = round.segmentIndex >= format.segments.length - 1;
  const hasPoi = format.segments.some((item) => item.poi);
  const wideLayout = layout !== 'phone';
  const ringSize = Math.round(wideLayout ? Math.min(width * 0.36, height * 0.5, 400) : Math.min(width - 72, height * 0.34, 320));

  const formatPill = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('timer.selectFormat')}: ${name}`}
      onPress={() => setMenu(true)}
      testID="timer-format"
      style={({ pressed }) => [styles.format, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
      <Text weight="medium" style={styles.formatLabel} numberOfLines={1}>
        {name}
      </Text>
      <Icon name="chevronDown" color={colors.tabInactive} size={18} />
    </Pressable>
  );

  const clock = (
    <View style={[styles.clockColumn, wideLayout && { width: Math.max(ringSize, 440) }]}>
      <View style={styles.sideLine}>
        <View style={[styles.sideDot, { backgroundColor: sideColors[segment.side] }]} />
        <Text tone="secondary" style={styles.sideText} numberOfLines={1}>
          {sideName}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel={`${tools('timer.clockLabel')}: ${face.text}, ${status}`}
        testID="timer-display">
        <TimerRing size={ringSize} fraction={overtime ? 1 : remainingMs / (segment.seconds * 1000)} warning={warning}>
          <Text weight="medium" tone="faint" style={styles.status} testID="timer-status">
            {status}
          </Text>
          <Text
            weight="bold"
            style={[styles.time, { fontSize: Math.round(ringSize * 0.24), lineHeight: Math.round(ringSize * 0.29) }, warning && { color: colors.destructive }]}
            testID="timer-time">
            {face.text}
          </Text>
          <Text tone="faint" style={styles.status}>
            {t('mobile.timer.ofTotal', { total: formatDuration(segment.seconds) })}
          </Text>
        </TimerRing>
      </View>
      <View style={styles.pills}>
        {poi && !overtime ? (
          <View
            testID="timer-poi"
            style={[styles.pill, { backgroundColor: poi === 'open' ? colors.successTint : colors.tile, borderColor: poi === 'open' ? colors.success : colors.tileBorder }]}>
            {poi === 'open' ? <Icon name="check" color={colors.success} size={14} /> : <Icon name="shield" color={colors.tileForeground} size={14} />}
            <Text weight="semibold" style={[styles.pillText, { color: poi === 'open' ? colors.success : colors.tileForeground }]}>
              {poi === 'open' ? tools('timer.poiOpen') : tools('timer.protected')}
            </Text>
          </View>
        ) : null}
        {segment.kind === 'reply' ? (
          <View style={[styles.pill, { backgroundColor: colors.segmentTrack, borderColor: colors.border }]}>
            <Text weight="semibold" tone="secondary" style={styles.pillText}>
              {tools('timer.noPoiInReply')}
            </Text>
          </View>
        ) : null}
      </View>
      {segment.poi ? <PoiStrip segment={segment} elapsed={elapsed} /> : null}
    </View>
  );

  const speeches = (
    <ScrollView
      horizontal={!wideLayout}
      scrollEnabled={!wideLayout}
      showsHorizontalScrollIndicator={false}
      style={wideLayout ? undefined : styles.speechRow}
      contentContainerStyle={wideLayout ? styles.speechGrid : styles.speeches}
      accessibilityLabel={tools('timer.speeches')}>
      {format.segments.map((item, index) => {
        const selected = index === round.segmentIndex;
        return (
          <Pressable
            key={`${item.id}-${index}`}
            accessibilityRole="tab"
            accessibilityLabel={`${item.label}, ${formatDuration(item.seconds)}`}
            accessibilityState={{ selected }}
            onPress={() => go(index)}
            testID={`timer-speech-${index}`}
            style={({ pressed }) => [
              styles.speech,
              { borderColor: selected ? colors.primaryFill : colors.border, backgroundColor: selected ? colors.primaryFill : colors.card },
              pressed && styles.pressed,
            ]}>
            <Text weight="semibold" style={[styles.speechShort, selected && { color: colors.onPrimary }]} numberOfLines={2}>
              {item.short}
            </Text>
            <View style={styles.speechMeta}>
              <View style={[styles.speechDot, { backgroundColor: selected ? colors.onPrimary : sideColors[item.side] }]} />
              <Text style={[styles.speechTime, { color: selected ? colors.onPrimary : colors.faint }]}>{formatDuration(item.seconds)}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const prepBanks = format.prepSeconds > 0 ? (
    <View style={styles.prepGroup} accessibilityLabel={tools('timer.prepGroup')}>
      <View style={styles.prepRow}>
        {(['a', 'b'] as const).map((side) => {
          const left = prepRemainingMs(round, side, now);
          const running = isPrepRunning(round, side);
          return (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityState={{ selected: running, disabled: left === 0 }}
              accessibilityLabel={`${tools('timer.prepFor', { side: sideNameFor(choice, format, side, t) })}, ${clockFace(left).text}`}
              disabled={left === 0}
              onPress={() => prep(side)}
              testID={`timer-prep-${side}`}
              style={({ pressed }) => [
                styles.prep,
                { borderColor: running ? colors.primaryFill : colors.border, backgroundColor: running ? colors.tile : colors.card },
                (pressed || left === 0) && styles.pressed,
              ]}>
              <Text tone="secondary" style={styles.prepLabel} numberOfLines={1}>
                {tools('timer.prepFor', { side: sideNameFor(choice, format, side, t) })}
              </Text>
              <Text weight="bold" style={[styles.prepTime, left === 0 && { color: colors.destructive }]}>
                {clockFace(left).text}
              </Text>
              <Text weight="semibold" style={[styles.prepAction, { color: left === 0 ? colors.faint : colors.primary }]}>
                {left === 0 ? tools('timer.prepUsed') : running ? tools('timer.pausePrep') : tools('timer.startPrep')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextButton label={tools('timer.resetPrep')} onPress={() => change((current) => ({ ...current, round: resetPrep(current.round, formatFor(current.choice)) }))} />
    </View>
  ) : null;

  const signals = (
    <View style={[styles.signals, { borderColor: colors.border }]}>
      <View style={styles.signalTitle}>
        <Icon name={muted ? 'volumeOff' : 'volume'} color={colors.faint} size={16} />
        <Text weight="semibold" tone="secondary" style={styles.signalText}>
          {t('timer.signals')}
        </Text>
      </View>
      {hasPoi ? (
        <Text tone="faint" style={styles.signalText}>
          {`${t('mobile.timer.poiSignal')}: ${t('mobile.timer.knock')}`}
        </Text>
      ) : null}
      <Text tone="faint" style={styles.signalText}>
        {`${t('timer.oneMinLeft')}: ${t('timer.oneBeep')}`}
      </Text>
      <Text tone="faint" style={styles.signalText}>
        {`${t('timer.timeUpSignal')}: ${t('timer.twoBeeps')}`}
      </Text>
      <Text tone="faint" style={[styles.signalText, styles.keepsRunning]}>
        {t('mobile.timer.keepsRunning')}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="timer-screen">
      <LiveTopBar
        left={<RoundIconButton icon="x" label={t('common.close')} onPress={() => router.back()} testID="timer-close" />}
        right={
          <RoundIconButton
            icon={muted ? 'volumeOff' : 'volume'}
            label={muted ? t('timer.enableSound') : t('timer.disableSound')}
            onPress={() => change((current) => ({ ...current, muted: !current.muted }))}
            testID="timer-sound"
          />
        }
        title={segment.label}
        subtitle={t('mobile.timer.speechOf', { n: round.segmentIndex + 1, of: format.segments.length })}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 170 }]}>
        {formatPill}
        {wideLayout ? (
          <View style={styles.wide}>
            {clock}
            <View style={styles.wideSide}>
              {speeches}
              {prepBanks}
              {signals}
            </View>
          </View>
        ) : (
          <>
            {clock}
            {speeches}
            {prepBanks}
            {signals}
          </>
        )}
      </ScrollView>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 18, backgroundColor: colors.background }]}>
        <SideControl icon="reset" label={t('mobile.timer.reset')} onPress={reset} disabled={elapsed === 0} testID="timer-reset" />
        <MainRoundControl icon={speechRunning ? 'pause' : 'play'} label={speechRunning ? t('timer.pause') : t('timer.start')} onPress={toggle} testID="timer-toggle" />
        <SideControl icon="skip" label={t('mobile.timer.next')} onPress={() => go(round.segmentIndex + 1)} disabled={isLast} testID="timer-next" />
      </View>

      <ActionMenu
        visible={menu}
        title={t('timer.selectFormat')}
        items={menuItems}
        cancelLabel={t('common.cancel')}
        onClose={() => setMenu(false)}
        onSelect={(key) => void onMenu(key)}
        testID="timer-format-menu"
      />
    </View>
  );
}

/** The protected and open stretches of a speech, with a marker where the speaker is, as the website's PoiStrip. */
function PoiStrip({ segment, elapsed }: { segment: RoundSegment; elapsed: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!segment.poi) return null;
  const total = segment.seconds;
  const opens = (segment.poi.opensAt / total) * 100;
  const closes = (segment.poi.closesAt / total) * 100;
  const position = Math.min(100, (elapsed / 1000 / total) * 100);
  return (
    <View style={styles.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="timer-poi-strip">
      <View style={[styles.stripTrack, { backgroundColor: colors.segmentTrack }]}>
        <View style={[styles.stripOpen, { left: `${opens}%`, width: `${closes - opens}%`, backgroundColor: colors.successFill }]} />
        <View style={[styles.stripMarker, { left: `${position}%`, backgroundColor: colors.foreground }]} />
      </View>
      <View style={styles.stripLabels}>
        <Text tone="faint" style={styles.stripText}>0:00</Text>
        <Text tone="faint" style={styles.stripText}>
          {t('timer.poiWindow', { ns: 'tools', from: formatDuration(segment.poi.opensAt), to: formatDuration(segment.poi.closesAt) })}
        </Text>
        <Text tone="faint" style={styles.stripText}>{formatDuration(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: 'center', gap: 20, paddingHorizontal: 20, paddingTop: 14 },
  format: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 38, maxWidth: '100%' },
  formatLabel: { fontSize: 15, flexShrink: 1 },
  pressed: { opacity: 0.6 },
  clockColumn: { alignItems: 'center', gap: 12, width: '100%' },
  sideLine: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%' },
  sideDot: { width: 10, height: 10, borderRadius: 5 },
  sideText: { fontSize: 15, flexShrink: 1 },
  status: { fontSize: 14, lineHeight: 19 },
  time: { letterSpacing: -2, fontVariant: ['tabular-nums'] },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, minHeight: 30 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 14 },
  strip: { width: '100%', maxWidth: 440, gap: 5 },
  stripTrack: { height: 12, borderRadius: 6, overflow: 'hidden' },
  stripOpen: { position: 'absolute', top: 0, bottom: 0, opacity: 0.75 },
  stripMarker: { position: 'absolute', top: 0, bottom: 0, width: 4, marginLeft: -2, borderRadius: 2 },
  stripLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  stripText: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  speechRow: { flexGrow: 0, alignSelf: 'stretch', marginHorizontal: -20 },
  // Centred when they fit; scrolling from the start when they don't.
  speeches: { gap: 8, paddingHorizontal: 20, flexGrow: 1, justifyContent: 'center' },
  speechGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speech: { minWidth: 72, minHeight: 52, borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  speechShort: { fontSize: 14.5, textAlign: 'center' },
  speechMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  speechDot: { width: 7, height: 7, borderRadius: 4 },
  speechTime: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  prepGroup: { width: '100%', maxWidth: 520, alignItems: 'center', gap: 6 },
  prepRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  prep: { flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  prepLabel: { fontSize: 13.5 },
  prepTime: { fontSize: 24, fontVariant: ['tabular-nums'] },
  prepAction: { fontSize: 13.5 },
  signals: { alignSelf: 'center', maxWidth: 520, width: '100%', borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, gap: 3 },
  signalTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  signalText: { fontSize: 14, lineHeight: 19 },
  keepsRunning: { marginTop: 4 },
  wide: { flexDirection: 'row', alignItems: 'flex-start', gap: 32, width: '100%', maxWidth: 1100 },
  wideSide: { flex: 1, gap: 18, paddingTop: 30 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-evenly', paddingTop: 12 },
});
