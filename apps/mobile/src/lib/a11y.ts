import { AccessibilityInfo } from 'react-native';

import i18n from './i18n';

/** How much of an answer VoiceOver reads on its own; the rest is a swipe away on screen. */
const SPOKEN_LIMIT = 400;

/** An answer as speech: Markdown marks and citation numbers out, whitespace folded, cut at a sentence. */
export function spokenText(markdown: string, limit = SPOKEN_LIMIT): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s*\[\d+\]/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  const sentence = cut.lastIndexOf('. ');
  return sentence > limit / 2 ? cut.slice(0, sentence + 1) : `${cut.trimEnd()}…`;
}

/**
 * VoiceOver hears an AI answer once it is finished, never token by token:
 * "Answer ready" and its first sentences. Streamed text itself is not a live region.
 */
export function announceAnswer(markdown: string) {
  const text = spokenText(markdown);
  AccessibilityInfo.announceForAccessibility(text ? `${i18n.t('mobile.a11y.answerReady')}. ${text}` : i18n.t('mobile.a11y.answerReady'));
}

/** A tool's result is ready to read: its title, so the student knows what opened. */
export function announceResult(title: string) {
  AccessibilityInfo.announceForAccessibility(i18n.t('mobile.a11y.resultReady', { title }));
}
