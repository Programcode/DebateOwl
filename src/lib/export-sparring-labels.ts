// Label and duration formatting shared by the DOCX and PDF sparring exporters.
// The Google Docs exporter runs on Deno in supabase/functions and has no sparring
// mode, so it does not consume these.
import i18n from '@/i18n';
import type { SparringSession } from './stores/sparring-store';

export function formatSparringDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function getSparringSideLabel(side: SparringSession['userSide']): string {
  return side === 'pro' ? i18n.t('export.proposition') : i18n.t('export.opposition');
}

export function getSparringWinnerLabel(session: SparringSession): string {
  const winner = session.scorecard?.winner;
  if (winner === 'user') return i18n.t('export.sparringUser');
  if (winner === 'ai') return i18n.t('export.sparringOpponent');
  return i18n.t('export.sparringTie');
}

export function getSparringCategoryLabel(category: string): string {
  return i18n.t(`sparring.category.${category}`, category);
}

export function getSparringTurnLabel(speech: SparringSession['speeches'][number]): string {
  return i18n.t(`sparring.turns.${speech.turnId}`, speech.role);
}

export function getSparringFormatLabel(format: SparringSession['format']): string {
  return i18n.t(`sparring.format.${format}`, format.toUpperCase());
}
