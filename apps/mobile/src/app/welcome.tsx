import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { MainActionButton, PrimaryButton, SecondaryButton, TextButton } from '@/components/buttons';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { Owl, useReduceMotion, type OwlPose } from '@/components/owl';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { useDebates } from '@/lib/debate-context';
import { markIntroSeen, markTourDone } from '@/lib/first-run';
import { haptics } from '@/lib/haptics';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The owl's personal name, as on the website (src/lib/debateowl-intro.ts). */
const OWL_NAME = 'Ollie';

// The website's beats (DebateOwlIntro.tsx): beat n shows lines 1..n and sets the owl's pose.
const BEATS: { at: number; pose: OwlPose }[] = [
  { at: 0, pose: 'surprised' },
  { at: 700, pose: 'celebrating' },
  { at: 2300, pose: 'idea' },
  { at: 3900, pose: 'thinking' },
  { at: 5600, pose: 'coach' },
];
const LAST_BEAT = BEATS.length - 1;

/** The website's four tour steps, as pages instead of pointers at a desktop layout. */
const STEPS: { key: string; pose: OwlPose; icon: IconName }[] = [
  { key: 'debate', pose: 'point', icon: 'target' },
  { key: 'library', pose: 'reading', icon: 'library' },
  { key: 'generate', pose: 'idea', icon: 'sparkles' },
  { key: 'ready', pose: 'celebrating', icon: 'check' },
];

/**
 * The first run, as one sheet: Ollie's welcome (the website's DebateOwlIntro,
 * line by line) and then the website's four-step tour. Got it continues into
 * the tour unless this account finished it; Skip tour, Get started and
 * closing the sheet all finish it, as on the website.
 */
export default function WelcomeScreen() {
  const { intro } = useLocalSearchParams<{ intro?: string }>();
  const [phase, setPhase] = useState<'intro' | number>(intro === '1' ? 'intro' : 0);
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();

  // Closing the sheet by swiping it away counts as Got it and Skip tour.
  const finished = useRef(false);
  useEffect(
    () => () => {
      if (finished.current || !userId) return;
      if (intro === '1') void markIntroSeen();
      void markTourDone(userId);
    },
    [intro, userId],
  );

  const finishTour = () => {
    finished.current = true;
    if (intro === '1') void markIntroSeen();
    if (userId) void markTourDone(userId);
    if (router.canDismiss()) router.dismiss();
    else router.back();
  };

  if (phase === 'intro') {
    return (
      <Intro
        onDone={(tourDone) => {
          void markIntroSeen();
          if (tourDone) finishTour();
          else setPhase(0);
        }}
      />
    );
  }
  return <Tour step={phase} onStep={setPhase} onFinish={finishTour} />;
}

function Intro({ onDone }: { onDone: (tourDone: boolean) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { tour } = useLocalSearchParams<{ tour?: string }>();
  const reduceMotion = useReduceMotion();
  const [beat, setBeat] = useState(0);
  const [settled, setSettled] = useState(false);
  const [lines] = useState(() => BEATS.slice(1).map(() => new Animated.Value(0)));

  useEffect(() => {
    if (reduceMotion || settled) {
      setBeat(LAST_BEAT);
      setSettled(true);
      lines.forEach((line) => line.setValue(1));
      return;
    }
    const timers = BEATS.slice(1).map(({ at }, index) =>
      setTimeout(() => {
        setBeat(index + 1);
        Animated.timing(lines[index], { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }, at),
    );
    const done = setTimeout(() => setSettled(true), 6600);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [reduceMotion, settled, lines]);

  const texts: { text: string; icon?: IconName; heading?: boolean }[] = [
    { text: t('debateOwlIntro.greetingNamed', { name: OWL_NAME }), heading: true },
    { text: t('debateOwlIntro.newLook'), icon: 'pencil' },
    { text: t('debateOwlIntro.company'), icon: 'more' },
    // Success is mint and always comes with a check mark.
    { text: t('debateOwlIntro.sameTools'), icon: 'check' },
  ];

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="debateowl-intro">
      <View style={styles.introTop}>
        <View style={[styles.owlCircle, { backgroundColor: colors.tile }]}>
          <Owl pose={BEATS[beat].pose} size={124} style={styles.owl} />
        </View>
        {/* VoiceOver reads the whole bubble at once; the lines only fade in on screen. */}
        <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]} accessible accessibilityLabel={texts.map((line) => line.text).join(' ')}>
          {texts.map((line, index) => (
            <Animated.View
              key={index}
              style={[styles.line, { opacity: lines[index], transform: [{ translateY: lines[index].interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
              {line.icon ? (
                <Icon name={line.icon} color={line.icon === 'check' ? colors.successFill : colors.primary} size={17} />
              ) : null}
              <Text weight={line.heading ? 'display' : 'regular'} style={line.heading ? styles.greeting : styles.lineText}>
                {line.text}
              </Text>
            </Animated.View>
          ))}
        </View>
      </View>
      <View style={styles.notice}>
        <Text accessibilityRole="header" weight="display" style={styles.noticeTitle}>
          {t('debateOwlIntro.noticeTitle')}
        </Text>
        <Text style={styles.noticeBody}>{t('debateOwlIntro.noticeBody')}</Text>
      </View>
      <View style={styles.footer}>
        {settled ? null : <TextButton label={t('debateOwlIntro.skipAnimation')} onPress={() => setSettled(true)} />}
        <View style={styles.flex}>
          <PrimaryButton label={t('debateOwlIntro.done')} onPress={() => onDone(tour === 'done')} testID="intro-done" />
        </View>
      </View>
    </SheetScrollView>
  );
}

function Tour({ step, onStep, onFinish }: { step: number; onStep: (step: number) => void; onFinish: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { current } = useDebates();
  const { key, pose, icon } = STEPS[step];
  const last = step === STEPS.length - 1;
  const title = t(key === 'debate' ? 'onboarding.welcome' : `onboarding.${key}`);
  const description =
    key === 'debate' ? t(current ? 'onboarding.debateCurrentDesc' : 'onboarding.debateFirstDesc') : t(`onboarding.${key}Desc`);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${t('mobile.tour.progress', { step: step + 1, steps: STEPS.length })}`);
  }, [title, step, t]);

  const go = (next: number) => {
    haptics.select();
    onStep(next);
  };

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID={`tour-step-${key}`}>
      <View style={styles.tourTop}>
        <View style={[styles.owlCircle, { backgroundColor: colors.tile }]}>
          <Owl pose={pose} size={124} style={styles.owl} />
        </View>
        <View style={[styles.stepIcon, { backgroundColor: colors.primaryFill }]}>
          <Icon name={icon} color={colors.onPrimary} size={18} />
        </View>
      </View>
      <View style={styles.dots} accessibilityLabel={t('mobile.tour.progress', { step: step + 1, steps: STEPS.length })} accessible>
        {STEPS.map((item, index) => (
          <View key={item.key} style={[styles.dot, { backgroundColor: index === step ? colors.primary : colors.borderStrong }, index === step && styles.dotCurrent]} />
        ))}
      </View>
      <View style={styles.notice}>
        <Text accessibilityRole="header" weight="display" style={styles.stepTitle}>
          {title}
        </Text>
        <Text style={[styles.noticeBody, styles.centred]}>{description}</Text>
      </View>
      {key === 'debate' && !current ? (
        // One primary action per step: before a debate exists, that is Start debate.
        <MainActionButton label={t('debate.startDebate')} onPress={() => router.push('/new-debate')} />
      ) : null}
      <View style={styles.footer}>
        {step > 0 ? (
          <View style={styles.flex}>
            <SecondaryButton label={t('onboarding.back')} onPress={() => go(step - 1)} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <PrimaryButton
            label={last ? t('onboarding.getStarted') : t('onboarding.next')}
            onPress={last ? onFinish : () => go(step + 1)}
            testID="tour-next"
          />
        </View>
      </View>
      {last ? null : (
        <View style={styles.skip}>
          <TextButton label={t('onboarding.skip')} onPress={onFinish} />
        </View>
      )}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, paddingTop: 30 },
  flex: { flex: 1 },
  introTop: { alignItems: 'center', gap: 18 },
  tourTop: { alignItems: 'center' },
  owlCircle: { width: 136, height: 136, borderRadius: 68, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  owl: { marginBottom: -8 },
  stepIcon: { position: 'absolute', bottom: 0, right: '36%', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bubble: { alignSelf: 'stretch', borderWidth: 2, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 14, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  greeting: { flex: 1, fontSize: 21, lineHeight: 27 },
  lineText: { flex: 1, fontSize: 16, lineHeight: 23 },
  notice: { gap: 8 },
  noticeTitle: { fontSize: 22, lineHeight: 28 },
  stepTitle: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  noticeBody: { fontSize: 16.5, lineHeight: 24 },
  centred: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotCurrent: { width: 22 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skip: { alignItems: 'center' },
});
