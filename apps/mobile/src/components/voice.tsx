import { formatRoundTime } from '@debatelab/core/sparring/formats';
import { LONG_PAUSE_SECONDS, type SpeechDelivery } from '@debatelab/core/voice/delivery';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { PrimaryButton, SecondaryButton, TextButton } from './buttons';
import { FormGroup, SwitchRow } from './form-rows';
import { Icon } from './icon';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import { opponentVoice, useOpponentVoice } from '@/lib/opponent-voice';
import type { SpeechCaptureError } from '@/lib/speech-capture';
import type { SpeechCaptureApi } from '@/lib/use-speech-capture';
import { acknowledgeVoiceNotice, useVoiceAvailability } from '@/lib/voice-availability';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

// The website's voice controls (src/components/features/voice/), drawn the
// app's way. The wording is the website's, except where it names a browser:
// on the phone it is Apple's recognizer, Settings and the device's voice.

const ERROR_KEYS: Record<SpeechCaptureError, string> = {
  'not-allowed': 'mobile.voice.notAllowed',
  'no-microphone': 'voiceRound.mic.noMicrophone',
  network: 'voiceRound.mic.network',
  'start-failed': 'voiceRound.mic.startFailed',
};

/**
 * Turns a round into a spoken one, as the website's VoiceModeToggle. Where
 * voice cannot run (Expo Go, or the microphone refused in Settings) the switch
 * stays off with the reason. The first time it is switched on, it says where
 * the audio and the text go, and waits for the student to agree.
 */
export function VoiceModeSwitch({ value, onChange, description }: { value: boolean; onChange: (value: boolean) => void; description: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const availability = useVoiceAvailability();
  const [notice, setNotice] = useState(false);

  if (!availability.available) {
    const reason = availability.reason === 'denied' ? t('mobile.voice.denied') : t('mobile.crossfire.voiceLater');
    return (
      <FormGroup>
        <SwitchRow first label={t('voiceRound.mode.label')} description={`${description} ${reason}`} value={false} onChange={() => {}} disabled />
        {availability.reason === 'denied' ? (
          <View style={styles.settingsRow}>
            <TextButton label={t('mobile.voice.openSettings')} onPress={() => void Linking.openSettings()} />
          </View>
        ) : null}
      </FormGroup>
    );
  }

  return (
    <View style={styles.modeGroup} testID="voice-mode">
      <FormGroup footer={value ? t('voiceRound.mode.privacyLine') : undefined}>
        <SwitchRow
          first
          label={t('voiceRound.mode.label')}
          description={description}
          value={value || notice}
          onChange={(next) => {
            if (!next) {
              setNotice(false);
              onChange(false);
            } else if (availability.noticeAcknowledged) {
              onChange(true);
            } else {
              setNotice(true);
            }
          }}
        />
      </FormGroup>
      {notice ? (
        <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.primaryFill }]} testID="voice-notice">
          <View style={styles.noticeTitleRow}>
            <Icon name="mic" color={colors.primary} size={20} />
            <Text weight="display" style={styles.noticeTitle}>
              {t('voiceRound.notice.title')}
            </Text>
          </View>
          {[t('voiceRound.notice.noRecording'), t('mobile.voice.recognition'), t('voiceRound.notice.opponent')].map((line) => (
            <View key={line} style={styles.bullet}>
              <View style={[styles.bulletDot, { backgroundColor: colors.faint }]} />
              <Text tone="secondary" style={styles.bulletText}>
                {line}
              </Text>
            </View>
          ))}
          <View style={styles.noticeActions}>
            <SecondaryButton label={t('common.cancel')} onPress={() => setNotice(false)} />
            <PrimaryButton
              label={t('voiceRound.notice.accept')}
              icon="mic"
              onPress={() => {
                acknowledgeVoiceNotice();
                setNotice(false);
                haptics.success();
                onChange(true);
              }}
              testID="voice-notice-accept"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The one "listening" signal, as the website's: a steady red dot and a label. */
function ListeningIndicator({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.listening} accessibilityRole="text" accessibilityLiveRegion="polite">
      <View style={[styles.listeningDot, { backgroundColor: colors.destructive }]} />
      <Text tone="secondary" style={styles.listeningText}>
        {label}
      </Text>
    </View>
  );
}

/** The microphone button for a spoken turn, with the words heard so far, as the website's VoiceMicControl. */
export function VoiceMicControl({ capture, onStart, onStop, disabled }: { capture: SpeechCaptureApi; onStart: () => void; onStop: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const listening = capture.listening;
  return (
    <View style={styles.mic} testID="voice-mic-control">
      <View style={styles.micRow}>
        <BouncePressable
          accessibilityRole="button"
          accessibilityState={{ disabled, selected: listening }}
          accessibilityLabel={listening ? t('voiceRound.mic.stop') : t('voiceRound.mic.start')}
          disabled={disabled}
          onPress={() => {
            haptics.tap();
            if (listening) onStop();
            else onStart();
          }}
          testID="voice-mic"
          style={[
            styles.micButton,
            listening
              ? { backgroundColor: colors.destructive, borderColor: colors.destructive }
              : { backgroundColor: colors.card, borderColor: colors.primaryFill },
            disabled && styles.dimmed,
          ]}>
          <Icon name={listening ? 'stop' : 'mic'} color={listening ? '#FFFFFF' : colors.primary} size={18} />
          <Text weight="semibold" style={[styles.micLabel, { color: listening ? '#FFFFFF' : colors.primary }]}>
            {listening ? t('voiceRound.mic.stop') : t('voiceRound.mic.start')}
          </Text>
        </BouncePressable>
        {listening ? <ListeningIndicator label={t('voiceRound.mic.listening')} /> : null}
      </View>
      {listening && capture.interim ? (
        <Text tone="faint" style={styles.interim} testID="voice-interim">
          {capture.interim}
        </Text>
      ) : null}
      {capture.error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
          {t(ERROR_KEYS[capture.error])}
        </Text>
      ) : null}
    </View>
  );
}

/** Shows that the opponent is speaking and lets the student stop it, as the website's OpponentVoiceBar. */
export function OpponentVoiceBar() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const voice = useOpponentVoice();
  if (voice.status === 'idle' && !voice.notice) return null;
  return (
    <View style={[styles.voiceBar, { backgroundColor: colors.card, borderColor: colors.border }]} testID="opponent-voice">
      {voice.status !== 'idle' ? (
        <View style={styles.voiceRow}>
          <View style={styles.voiceStatus} accessibilityLiveRegion="polite">
            <Icon name="volume" color={colors.primary} size={18} />
            <Text weight="semibold" style={styles.voiceText}>
              {voice.status === 'loading' ? t('voiceRound.opponent.loading') : t('voiceRound.opponent.speaking')}
            </Text>
          </View>
          <TextButton label={t('voiceRound.opponent.stop')} onPress={opponentVoice.stop} />
        </View>
      ) : null}
      {voice.notice === 'limit' ? (
        <Text tone="faint" style={styles.voiceNote}>
          {t('mobile.voice.limit')}
        </Text>
      ) : null}
    </View>
  );
}

/** The measured facts of a spoken turn, as the website's DeliveryFacts: numbers, nothing about how the speaker sounded. */
export function DeliveryFacts({ delivery, timeLimitSeconds }: { delivery: SpeechDelivery; timeLimitSeconds?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const facts: [string, string][] = [
    [
      t('voiceRound.delivery.speakingTime'),
      timeLimitSeconds
        ? t('voiceRound.delivery.timeOfLimit', { used: formatRoundTime(delivery.speakingSeconds), limit: formatRoundTime(timeLimitSeconds) })
        : formatRoundTime(delivery.speakingSeconds),
    ],
    [t('voiceRound.delivery.pace'), t('voiceRound.delivery.wordsPerMinute', { count: delivery.wordsPerMinute })],
    [
      t('voiceRound.delivery.fillers'),
      delivery.fillers.length > 0
        ? `${delivery.fillerCount} (${delivery.fillers.map((filler) => `${filler.word} × ${filler.count}`).join(', ')})`
        : String(delivery.fillerCount),
    ],
    [
      t('voiceRound.delivery.longPauses', { seconds: LONG_PAUSE_SECONDS }),
      delivery.longPauses > 0
        ? t('voiceRound.delivery.pausesWithLongest', { count: delivery.longPauses, seconds: delivery.longestPauseSeconds })
        : String(delivery.longPauses),
    ],
  ];
  return (
    <View testID="delivery-facts">
      {facts.map(([label, value], index) => (
        <View key={label} style={[styles.fact, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
          <Text tone="secondary" style={styles.factLabel}>
            {label}
          </Text>
          <Text weight="semibold" style={styles.factValue}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The spoken delivery of a whole round, with the website's explanation of what was measured. */
export function DeliverySummary({ delivery }: { delivery: SpeechDelivery }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]} testID="spoken-delivery">
      <View style={styles.noticeTitleRow}>
        <Icon name="mic" color={colors.primary} size={18} />
        <Text weight="semibold" style={styles.summaryTitle}>
          {t('voiceRound.delivery.title')}
        </Text>
      </View>
      <Text tone="faint" style={styles.summaryText}>
        {t('mobile.voice.deliveryDescription')}
      </Text>
      <DeliveryFacts delivery={delivery} />
    </View>
  );
}

/**
 * A field's dictation button, as the website's microphone beside Generate's
 * motion and Ask's question. It shows only where speech recognition exists.
 */
export function DictationButton({ capture, startLabel, stopLabel, inline }: { capture: SpeechCaptureApi; startLabel: string; stopLabel: string; inline?: boolean }) {
  const { colors } = useTheme();
  if (!capture.available) return null;
  const listening = capture.listening;
  if (inline) {
    // Inside a composer, beside the paperclip: an icon that turns red while listening.
    return (
      <BouncePressable
        accessibilityRole="button"
        accessibilityLabel={listening ? stopLabel : startLabel}
        accessibilityState={{ selected: listening }}
        onPress={() => {
          haptics.tap();
          if (listening) void capture.stop();
          else void capture.start();
        }}
        hitSlop={6}
        testID="dictate"
        style={styles.dictateInline}>
        <Icon name={listening ? 'stop' : 'mic'} color={listening ? colors.destructive : colors.secondary} size={20} />
      </BouncePressable>
    );
  }
  return (
    <BouncePressable
      accessibilityRole="button"
      accessibilityLabel={listening ? stopLabel : startLabel}
      accessibilityState={{ selected: listening }}
      onPress={() => {
        haptics.tap();
        if (listening) void capture.stop();
        else void capture.start();
      }}
      hitSlop={6}
      testID="dictate"
      style={[
        styles.dictate,
        listening ? { backgroundColor: colors.destructive, borderColor: colors.destructive } : { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      <Icon name={listening ? 'stop' : 'mic'} color={listening ? '#FFFFFF' : colors.primary} size={20} />
    </BouncePressable>
  );
}

/** What a dictated field says under it: listening, the words on their way, or why it stopped. */
export function DictationStatus({ capture, listeningLabel }: { capture: SpeechCaptureApi; listeningLabel: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!capture.listening && !capture.error) return null;
  return (
    <View style={styles.mic}>
      {capture.listening ? <ListeningIndicator label={listeningLabel} /> : null}
      {capture.listening && capture.interim ? (
        <Text tone="faint" style={styles.interim}>
          {capture.interim}
        </Text>
      ) : null}
      {capture.error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
          {capture.error === 'not-allowed' ? t('mobile.voice.notAllowed') : t('voice.startFailed')}
        </Text>
      ) : null}
    </View>
  );
}

/** Joins dictated words onto what is already in a field. */
export function appendDictation(current: string, text: string, max = Infinity): string {
  return `${current}${current && !/\s$/.test(current) ? ' ' : ''}${text}`.slice(0, max);
}

const styles = StyleSheet.create({
  modeGroup: { gap: 12 },
  settingsRow: { paddingHorizontal: 15, paddingBottom: 12 },
  notice: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 10 },
  noticeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeTitle: { fontSize: 18, flexShrink: 1 },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 21 },
  noticeActions: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  mic: { gap: 6 },
  micRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  micButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 999, paddingHorizontal: 16, minHeight: 44 },
  micLabel: { fontSize: 15.5 },
  dimmed: { opacity: 0.55 },
  listening: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  listeningDot: { width: 9, height: 9, borderRadius: 5 },
  listeningText: { fontSize: 14.5 },
  interim: { fontSize: 15, lineHeight: 21, fontStyle: 'italic' },
  error: { fontSize: 14.5, lineHeight: 20 },
  voiceBar: { borderWidth: 2, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  voiceStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  voiceText: { fontSize: 15, flexShrink: 1 },
  voiceNote: { fontSize: 13.5, lineHeight: 19 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 8 },
  factLabel: { fontSize: 14.5, flexShrink: 1 },
  factValue: { fontSize: 14.5, textAlign: 'right', fontVariant: ['tabular-nums'], flexShrink: 1 },
  summary: { borderWidth: 2, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  summaryTitle: { fontSize: 16.5 },
  summaryText: { fontSize: 14, lineHeight: 19 },
  dictateInline: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  dictate: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
