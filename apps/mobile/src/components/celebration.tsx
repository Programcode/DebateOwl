import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from './buttons';
import { Owl } from './owl';
import { SuccessCheck } from './success-check';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import { palette, radius } from '@/theme/colors';
import { DURATION, EASE, SPRING, staggerDelay, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/use-theme';

/** A number the celebration counts up to, with the label the result already uses for it. */
type CelebrationStat = {
  key: string;
  label: string;
  value: number;
  /** How the number reads, such as seconds as 4:05; plain digits by default. */
  format?: (value: number) => string;
};

/** How long the overlay stays before it goes on its own; longer when nothing moves, never under two seconds. */
const HOLD_MS = 2400;
const HOLD_REDUCED_MS = 3000;
const COUNT_MS = 600;
const BURST_MS = 1200;
const PIECES = 36;
// Pixels per second squared: the burst rises, slows and falls back past the owl within the burst.
const GRAVITY = 1500;

const plain = (value: number) => String(value);

/**
 * Results that should celebrate when their document opens: Generate marks the case it just
 * made, and the case screen takes the mark once, so reopening a saved case never celebrates.
 */
const pending = new Set<string>();

export function markCelebration(key: string) {
  pending.add(key);
}

/** Whether `key` was just finished; the mark is cleared by `clearCelebration` once the screen has read it. */
export function hasCelebration(key: string | undefined): boolean {
  return Boolean(key && pending.has(key));
}

export function clearCelebration(key: string | undefined) {
  if (key) pending.delete(key);
}

/**
 * The moment a round, a practice or a case is finished, over the result it covers: Ollie cheers,
 * confetti bursts in the brand colours, the mint check pops and the stats count up. It goes after
 * a few seconds or on any tap, and lets the screen underneath take touches from that moment.
 * VoiceOver hears the title and the stats once and finds one button that dismisses it, which then
 * stays until it is pressed. Under Reduce Motion it fades in with its final numbers, with no
 * confetti and no cheer. `haptic={false}` where the result's arrival already tapped success.
 */
export function Celebration({
  eyebrow,
  title,
  stats,
  onDone,
  haptic = true,
}: {
  eyebrow?: string;
  title: string;
  stats: CelebrationStat[];
  onDone: () => void;
  haptic?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const shown = stats.slice(0, 3);
  const [leaving, setLeaving] = useState(false);
  const fade = useSharedValue(0);
  const rise = useSharedValue(reduce ? 1 : 0);
  const onDoneRef = useRef(onDone);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gone = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const dismiss = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    setLeaving(true);
    // A fade is not motion, so it plays under Reduce Motion too.
    fade.set(withTiming(0, { duration: DURATION.fast, easing: EASE.accelerate, reduceMotion: ReduceMotion.Never }));
    timers.current.push(setTimeout(() => onDoneRef.current(), DURATION.fast));
  }, [fade]);

  const announcement = [eyebrow, title, ...shown.map((stat) => `${stat.label}: ${(stat.format ?? plain)(stat.value)}`)].filter(Boolean).join('. ');

  // Once per mount: arrive, announce, and go on its own unless VoiceOver is reading it.
  useEffect(() => {
    fade.set(withTiming(1, { duration: DURATION.fast, easing: EASE.decelerate, reduceMotion: ReduceMotion.Never }));
    if (!reduce) rise.set(withSpring(1, SPRING.pop));
    AccessibilityInfo.announceForAccessibility(announcement);
    let cancelled = false;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((reading) => {
        if (!cancelled && !reading) timers.current.push(setTimeout(dismiss, reduce ? HOLD_REDUCED_MS : HOLD_MS));
      })
      .catch((): void => {});
    const pendingTimers = timers.current;
    return () => {
      cancelled = true;
      pendingTimers.forEach(clearTimeout);
    };
    // The moment plays once; a re-render of the screen underneath must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay = useAnimatedStyle(() => ({ opacity: fade.value }));
  const card = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - rise.value) * 24 }, { scale: 0.92 + 0.08 * rise.value }],
  }));

  return (
    // Modal for VoiceOver: the screen underneath is skipped until the celebration goes.
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, overlay]} pointerEvents={leaving ? 'none' : 'auto'} accessibilityViewIsModal={!leaving}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={announcement}
        accessibilityHint={t('debate.continue')}
        onAccessibilityEscape={dismiss}
        onPress={dismiss}
        testID="celebration"
        style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.column, card]}>
          <View style={styles.hero}>
            <Owl pose="celebrating" size={148} gesture={reduce ? false : 'cheer'} breathe={false} />
            <View style={styles.check}>
              <SuccessCheck size={46} delay={reduce ? 0 : 220} haptic={haptic} />
            </View>
            {reduce ? null : <Confetti />}
          </View>
          <View style={styles.heading}>
            {eyebrow ? (
              <Text weight="semibold" tone="secondary" style={styles.eyebrow} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            {/* A case's title is its motion, so a long one steps down a size. */}
            <Text weight="display" style={[styles.title, title.length > 48 && styles.titleLong]} numberOfLines={4}>
              {title}
            </Text>
          </View>
          {shown.length > 0 ? (
            <View style={styles.stats}>
              {shown.map((stat, index) => (
                <StatTile key={stat.key} stat={stat} index={index} animate={!reduce} last={index === shown.length - 1} />
              ))}
            </View>
          ) : null}
        </Animated.View>
        <View style={[styles.action, { bottom: insets.bottom + 18 }]}>
          <View style={styles.actionColumn}>
            <PrimaryButton label={t('debate.continue')} onPress={dismiss} testID="celebration-continue" />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** One stat: the tile pops in after the title, then its number counts up; the last one ticks as it lands. */
function StatTile({ stat, index, animate, last }: { stat: CelebrationStat; index: number; animate: boolean; last: boolean }) {
  const { colors } = useTheme();
  const delay = 260 + staggerDelay(index) * 2;
  const pop = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) pop.set(withDelay(delay, withSpring(1, SPRING.pop)));
  }, [animate, delay, pop]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ translateY: (1 - pop.value) * 14 }, { scale: 0.8 + 0.2 * pop.value }],
  }));
  return (
    <Animated.View style={[styles.tile, { backgroundColor: colors.tile, borderColor: colors.tileBorder }, style]}>
      <CountUp value={stat.value} format={stat.format ?? plain} delay={delay + 80} animate={animate} tick={last} />
      <Text tone="secondary" style={styles.tileLabel} numberOfLines={2}>
        {stat.label}
      </Text>
    </Animated.View>
  );
}

/** The number alone re-renders while it counts, on the display's frames, eased out over 600 ms. */
function CountUp({ value, format, delay, animate, tick }: { value: number; format: (value: number) => string; delay: number; animate: boolean; tick: boolean }) {
  const { colors } = useTheme();
  const [current, setCurrent] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / COUNT_MS);
      setCurrent(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
      else if (tick) haptics.select();
    };
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [animate, delay, tick, value]);
  return (
    <Text weight="displayBold" style={[styles.tileValue, { color: colors.primary }]} maxFontSizeMultiplier={1.4} numberOfLines={1}>
      {format(current)}
    </Text>
  );
}

type Piece = { vx: number; vy: number; spin: number; flip: number; start: number; color: string; width: number; height: number; round: number };

/** A burst of rounded pieces from behind the owl: random angles and speeds, gravity, a spin and a flip. */
function burst(colors: string[]): Piece[] {
  return Array.from({ length: PIECES }, (_, index) => {
    // An upward cone, a little wider than straight up, so pieces arc out over both sides.
    const angle = (-160 + Math.random() * 140) * (Math.PI / 180);
    const speed = 420 + Math.random() * 420;
    const dot = index % 4 === 0;
    const width = dot ? 8 : 7 + Math.random() * 3;
    const height = dot ? 8 : 11 + Math.random() * 4;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 1440,
      flip: 6 + Math.random() * 9,
      start: Math.random() * 0.08,
      color: colors[index % colors.length],
      width,
      height,
      round: dot ? 4 : 2.5,
    };
  });
}

function Confetti() {
  const { colors } = useTheme();
  // Brand blue, mint, beak gold and the light plume blue; one set of throws for this burst's lifetime.
  const [pieces] = useState(() => burst([colors.primaryFill, colors.successFill, colors.accent, palette.light.chipSelectedBorder]));
  const [done, setDone] = useState(false);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: BURST_MS, easing: Easing.linear }));
    const timer = setTimeout(() => setDone(true), BURST_MS + 100);
    return () => clearTimeout(timer);
  }, [progress]);
  if (done) return null;
  return (
    <View style={styles.emitter} pointerEvents="none">
      {pieces.map((piece, index) => (
        <ConfettiPiece key={index} piece={piece} progress={progress} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, progress }: { piece: Piece; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const seconds = Math.max(0, progress.value * (BURST_MS / 1000) - piece.start);
    // Air slows the sideways throw; gravity pulls the rise back down.
    const x = piece.vx * seconds * (1 - Math.min(seconds, 1.2) * 0.32);
    const y = piece.vy * seconds + 0.5 * GRAVITY * seconds * seconds;
    const life = progress.value;
    return {
      opacity: life >= 1 ? 0 : life < 0.7 ? 1 : 1 - (life - 0.7) / 0.3,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.spin * seconds}deg` },
        { scaleX: Math.cos(piece.flip * seconds) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.width, height: piece.height, marginLeft: -piece.width / 2, marginTop: -piece.height / 2, borderRadius: piece.round, backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

/**
 * Content that arrives with a short pop, `index` steps after the first, once `hold` is off: a
 * scorecard's cards wait under the celebration and arrive as it goes. Under Reduce Motion it is
 * simply there.
 */
export function PopIn({ index = 0, hold = false, children }: { index?: number; hold?: boolean; children: ReactNode }) {
  const reduce = useReduceMotion();
  const pop = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      pop.set(1);
      return;
    }
    if (!hold) pop.set(withDelay(staggerDelay(index), withTiming(1, { duration: 260, easing: EASE.overshoot })));
  }, [hold, index, pop, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5),
    transform: [{ translateY: (1 - pop.value) * 12 }, { scale: 0.96 + 0.04 * pop.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { zIndex: 50 },
  scrim: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 18 },
  hero: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', right: -6, bottom: 4 },
  emitter: { position: 'absolute', left: '50%', top: '42%', width: 0, height: 0 },
  piece: { position: 'absolute', left: 0, top: 0 },
  heading: { alignItems: 'center', gap: 4 },
  eyebrow: { fontSize: 15, textAlign: 'center' },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6, textAlign: 'center' },
  titleLong: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  stats: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', justifyContent: 'center' },
  tile: { flex: 1, maxWidth: 136, borderWidth: 2, borderRadius: radius.tile, paddingHorizontal: 10, paddingVertical: 12, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 13.5, lineHeight: 18, textAlign: 'center' },
  action: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  actionColumn: { width: '100%', maxWidth: 420, paddingHorizontal: 24 },
});
