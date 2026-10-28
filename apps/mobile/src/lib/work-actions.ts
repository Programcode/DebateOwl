import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast';
import { useAuth } from './auth';
import { confirmDestructive } from './confirm';
import type { DebateItem } from './debates';
import { shareText } from './export';
import { haptics } from './haptics';
import {
  attackToText,
  brainstormToText,
  caseToText,
  discussAttackMessage,
  discussBrainstormMessage,
  discussCaseMessage,
  discussFactoidsMessage,
  factoidsToText,
} from './result-text';
import { deleteResult, fetchResult, isCompleteAttack, isCompleteCase, readBrainstorm, readFactoids, type ResultKind } from './results';
import { deleteSparringRound, sparringDraft } from './sparring';

const DOCUMENT_KINDS = new Set<string>(['case', 'attack', 'brainstorm', 'factoids']);

/** Kinds whose saved row reads back as a document with text: Discuss and Share work on them. */
export function hasDocumentText(item: Pick<DebateItem, 'kind'>): item is { kind: ResultKind } {
  return DOCUMENT_KINDS.has(item.kind);
}

/** The website's History deletes cases and Sparring rounds, each after its own confirmation; the menus do the same. */
export function canDeleteWork(item: Pick<DebateItem, 'kind'>): boolean {
  return item.kind === 'case' || item.kind === 'sparring';
}

/**
 * What a saved result's context menu does: Discuss takes it to Ask with the
 * document's own Discuss message, Share sends its text, and Delete removes a
 * case or a Sparring round after the website's confirmation.
 */
export function useWorkActions() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const read = useCallback(async (item: DebateItem): Promise<{ text: string; discuss: string } | null> => {
    if (!userId || !hasDocumentText(item)) return null;
    const saved = await fetchResult(userId, item.kind, item.id);
    const output = saved?.output;
    if (item.kind === 'case' && isCompleteCase(output)) return { text: caseToText(output), discuss: discussCaseMessage(output) };
    if (item.kind === 'attack' && isCompleteAttack(output)) return { text: attackToText(output, t), discuss: discussAttackMessage(output) };
    const brainstorm = item.kind === 'brainstorm' ? readBrainstorm(output) : null;
    if (brainstorm) return { text: brainstormToText(brainstorm, t), discuss: discussBrainstormMessage(brainstorm, t) };
    const factoids = item.kind === 'factoids' ? readFactoids(output) : null;
    if (factoids) return { text: factoidsToText(factoids, t), discuss: discussFactoidsMessage(factoids) };
    return null;
  }, [t, userId]);

  const failed = useCallback(() => toast({ tone: 'error', title: t('mobile.results.loadFailed') }), [t, toast]);

  const discuss = useCallback(async (item: DebateItem) => {
    const doc = await read(item).catch(() => null);
    if (!doc) return failed();
    router.push({ pathname: '/ask', params: { prompt: doc.discuss } });
  }, [failed, read, router]);

  const share = useCallback(async (item: DebateItem) => {
    const doc = await read(item).catch(() => null);
    if (!doc) return failed();
    await shareText(item.title, doc.text).catch(() => {});
  }, [failed, read]);

  const remove = useCallback(async (item: DebateItem): Promise<boolean> => {
    if (!userId || !canDeleteWork(item)) return false;
    const sparring = item.kind === 'sparring';
    const confirmed = await confirmDestructive({
      title: t(sparring ? 'historyPage.deleteSparringTitle' : 'historyPage.deleteCaseTitle'),
      message: t(sparring ? 'historyPage.deleteSparringDesc' : 'historyPage.deleteCaseDesc'),
      confirm: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (!confirmed) return false;
    try {
      if (sparring) {
        await deleteSparringRound(userId, item.id);
        if (sparringDraft.get()?.id === item.id) sparringDraft.set(null);
      } else {
        await deleteResult(userId, 'case', item.id);
      }
      haptics.success();
      return true;
    } catch {
      toast({ tone: 'error', title: t(sparring ? 'historyPage.sparringDeleteFailed' : 'historyPage.deleteFailed') });
      return false;
    }
  }, [t, toast, userId]);

  return { discuss, share, remove };
}
