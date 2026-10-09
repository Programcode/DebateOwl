import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionMenu } from '@/components/action-menu';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { LiveTopBar, MainRoundControl, RoundIconButton, SideControl } from '@/components/round-controls';
import { Text } from '@/components/text';
import { TimerRing } from '@/components/timer-ring';
import {
  formatClock,
  idleClock,
  pauseClock,
  remainingSeconds,
  signalBetween,
  startClock,
  TIMER_FORMATS,
  type TimerClock,
} from '@/lib/timer';
import { useKeepAwakeWhile, useTimerSignals } from '@/lib/timer-signals';
import { useTheme } from '@/theme/use-theme';

const TICK_MS = 250;

/**
 * The debate timer, as the website's TimerPage: pick a format and a speech,
 * then run its clock with a beep at one minute left and two at time up. Full
 * screen with no tab bar, like the live Sparring round in mock 05.
 */
export default function TimerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const [formatId, setFormatId] = useState(TIMER_FORMATS[0].id);
  const [speechIndex, setSpeechIndex] = useState(0);
  const format = TIMER_FORMATS.find((item) => item.id === formatId) ?? TIMER_FORMATS[0];
  const speech = format.speeches[speechIndex] ?? format.speeches[0];
  const [clock, setClock] = useState<TimerClock>(() => idleClock(speech.minutes));
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);
  const [formatMenu, setFormatMenu] = useState(false);
  const signal = useTimerSignals();

  const remaining = remainingSeconds(clock, now);
  const running = clock.startedAt !== null && remaining > 0;
  const finished = remaining === 0;
  const total = speech.minutes * 60;
  useKeepAwakeWhile(running);

  // The clock reads the time from its start timestamp; the tick only redraws it.
  useEffect(() => {
    if (clock.startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    // Coming back from the background redraws at once, with any signal that came due.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [clock.startedAt]);

  // Signals fire as the time left crosses a threshold, and the clock stops at zero.
  const lastRemaining = useRef(remaining);
  useEffect(() => {
    const previous = lastRemaining.current;
    lastRemaining.current = remaining;
    if (clock.startedAt === null) return;
    const due = signalBetween(previous, remaining);
    if (due) signal(due, sound);
    if (remaining === 0) setClock((current) => pauseClock(current, Date.now()));
  }, [clock.startedAt, remaining, signal, sound]);

  const selectSpeech = (index: number, formatSpeeches = format.speeches) => {
    const next = formatSpeeches[index];
    if (!next) return;
    setSpeechIndex(index);
    setClock(idleClock(next.minutes));
    setNow(Date.now());
  };

  const toggle = () => {
    const at = Date.now();
    setNow(at);
    if (finished) {
      // At time up the main button starts the next speech, or sets the last one up again.
      const next = format.speeches[speechIndex + 1];
      if (next) {
        setSpeechIndex(speechIndex + 1);
        setClock(startClock(idleClock(next.minutes), at));
      } else {
        setClock(idleClock(speech.minutes));
      }
      return;
    }
    // TODO(live-activity): start a Live Activity here, from the same timestamps, once the dev build lands.
    setClock((current) => (current.startedAt === null ? startClock(current, at) : pauseClock(current, at)));
  };

  const reset = () => {
    setClock(idleClock(speech.minutes));
    setNow(Date.now());
  };

  const ringSize = Math.round(Math.min(width - 72, height * 0.36, 320));
  const warning = remaining < 30 && remaining > 0;
  const status = finished ? t('timer.timeUp') : running ? t('timer.speaking') : t('timer.paused');
  const hasNext = speechIndex < format.speeches.length - 1;
  const mainLabel = finished && !hasNext ? t('mobile.timer.reset') : running ? t('timer.pause') : t('timer.start');
  const mainIcon = finished && !hasNext ? 'reset' : running ? 'pause' : 'play';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="timer-screen">
      <LiveTopBar
        left={<RoundIconButton icon="x" label={t('common.close')} onPress={() => router.back()} testID="timer-close" />}
        right={
          <RoundIconButton
            icon={sound ? 'volume' : 'volumeOff'}
            label={sound ? t('timer.disableSound') : t('timer.enableSound')}
            onPress={() => setSound((value) => !value)}
            testID="timer-sound"
          />
        }
        title={t(speech.labelKey)}
        subtitle={t('mobile.timer.speechOf', { n: speechIndex + 1, of: format.speeches.length })}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 170 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('timer.selectFormat')}: ${t(format.nameKey)}`}
          onPress={() => setFormatMenu(true)}
          testID="timer-format"
          style={({ pressed }) => [styles.format, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
          <Text weight="medium" style={styles.formatLabel} numberOfLines={1}>
            {t(format.nameKey)}
          </Text>
          <Icon name="chevronDown" color={colors.tabInactive} size={18} />
        </Pressable>

        <View accessible accessibilityRole="timer" accessibilityLabel={`${t('timer.displayLabel')}: ${formatClock(remaining)}, ${status}`} testID="timer-display">
          <TimerRing size={ringSize} fraction={total > 0 ? remaining / total : 0} warning={warning || finished}>
            <Text weight="medium" tone="faint" style={styles.status} testID="timer-status">
              {status}
            </Text>
            <Text
              weight="bold"
              style={[styles.time, { fontSize: Math.round(ringSize * 0.25), lineHeight: Math.round(ringSize * 0.29) }, (warning || finished) && { color: colors.destructive }]}
              testID="timer-time">
              {formatClock(remaining)}
            </Text>
            <Text tone="faint" style={styles.status}>
              {t('mobile.timer.ofTotal', { total: formatClock(total) })}
            </Text>
          </TimerRing>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.speechRow} contentContainerStyle={styles.speeches}>
          {format.speeches.map((item, index) => (
            <Chip
              key={item.id}
              label={`${t(item.labelKey)} (${item.minutes}m)`}
              selected={index === speechIndex}
              accessibilityRole="tab"
              onPress={() => selectSpeech(index)}
              testID={`timer-speech-${item.id}`}
            />
          ))}
        </ScrollView>

        <View style={[styles.signals, { borderColor: colors.border }]}>
          <View style={styles.signalTitle}>
            <Icon name={sound ? 'volume' : 'volumeOff'} color={colors.faint} size={16} />
            <Text weight="semibold" tone="secondary" style={styles.signalText}>
              {t('timer.signals')}
            </Text>
          </View>
          <Text tone="faint" style={styles.signalText}>
            {`${t('timer.oneMinLeft')}: ${t('timer.oneBeep')}`}
          </Text>
          <Text tone="faint" style={styles.signalText}>
            {`${t('timer.timeUpSignal')}: ${t('timer.twoBeeps')}`}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 18, backgroundColor: colors.background }]}>
        <SideControl icon="reset" label={t('mobile.timer.reset')} onPress={reset} testID="timer-reset" />
        <MainRoundControl icon={mainIcon} label={mainLabel} onPress={toggle} testID="timer-toggle" />
        <SideControl icon="skip" label={t('mobile.timer.next')} onPress={() => selectSpeech(speechIndex + 1)} disabled={!hasNext} testID="timer-next" />
      </View>

      <ActionMenu
        visible={formatMenu}
        title={t('timer.selectFormat')}
        items={TIMER_FORMATS.map((item) => ({ key: item.id, label: t(item.nameKey), icon: item.id === formatId ? 'check' : undefined }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setFormatMenu(false)}
        onSelect={(key) => {
          const next = TIMER_FORMATS.find((item) => item.id === key);
          if (!next) return;
          setFormatId(next.id);
          selectSpeech(0, next.speeches);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: 'center', gap: 22, paddingHorizontal: 20, paddingTop: 14 },
  format: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 38 },
  formatLabel: { fontSize: 15 },
  pressed: { opacity: 0.7 },
  status: { fontSize: 14, lineHeight: 19 },
  time: { letterSpacing: -2, fontVariant: ['tabular-nums'] },
  speechRow: { flexGrow: 0, alignSelf: 'stretch', marginHorizontal: -20 },
  // Centred when they fit, as on iPad; scrolling from the start when they don't.
  speeches: { gap: 8, paddingHorizontal: 20, flexGrow: 1, justifyContent: 'center' },
  signals: { alignSelf: 'center', maxWidth: 520, width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, gap: 3 },
  signalTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  signalText: { fontSize: 14, lineHeight: 19 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-evenly', paddingTop: 12 },
});
