import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast';
import { folderLabel } from '@/components/source-display';
import { useAuth } from './auth';
import { copyText, shareText } from './export';
import { haptics } from './haptics';
import { isKnownOffline } from './network-status';
import { addSource, removeSource, setSourcesActive, updateSource, type Source } from './sources';

/** A source as plain text: its title, where it came from, and its text, as the website copies it. */
export function sourceText(source: Pick<Source, 'title' | 'content' | 'origin'>, withOrigin = false): string {
  return [source.title, withOrigin ? source.origin : null, source.content].filter(Boolean).join('\n\n');
}

/**
 * What the Library does to one source, with the website's messages: delete
 * at once with Undo, switch it on or off for the AI, move it, copy or share it.
 * A change that does not reach the server never looks saved; the caller puts
 * the row back when a write resolves false.
 */
export function useSourceActions() {
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  /** Offline, nothing is written, so the change is refused up front, as on the website. */
  const refuseOffline = useCallback((title: string) => {
    if (!isKnownOffline()) return false;
    toast({ tone: 'error', title, message: t('libraryPage.offlineNotSaved') });
    return true;
  }, [t, toast]);

  const remove = useCallback(async (source: Source): Promise<boolean> => {
    if (!userId || !source.debateId) return false;
    try {
      await removeSource(userId, source.id, source.debateId);
    } catch (cause) {
      console.warn('Could not delete the source:', cause instanceof Error ? cause.message : cause);
      toast({ tone: 'error', title: t('common.error'), message: t('libraryPage.deleteFailed') });
      return false;
    }
    haptics.success();
    // A source can be put back exactly, so deleting acts at once and offers Undo instead of asking first.
    toast({
      title: t('libraryPage.sourceDeletedTitle', { title: source.title }),
      action: {
        label: t('common.undo'),
        onPress: () => {
          addSource(userId, {
            id: source.id,
            createdAt: source.createdAt,
            title: source.title,
            content: source.content,
            type: source.type,
            origin: source.origin,
            folder: source.folder,
            isActive: source.isActive,
            metadata: source.metadata,
            debateId: source.debateId!,
          })
            .then(() => haptics.success())
            .catch(() => toast({ tone: 'error', title: t('libraryPage.restoreFailed') }));
        },
      },
    });
    return true;
  }, [t, toast, userId]);

  const setActive = useCallback(async (sources: Source[], isActive: boolean, folder?: string): Promise<boolean> => {
    const failedTitle = folder ? t('libraryPage.folderUpdateFailed') : t('libraryPage.toggleFailed');
    const debateId = sources[0]?.debateId;
    if (!userId || !debateId) return false;
    if (refuseOffline(t('libraryPage.offlineTitle'))) return false;
    haptics.tap();
    try {
      await setSourcesActive(userId, debateId, sources.map((source) => source.id), isActive);
      return true;
    } catch (cause) {
      console.warn('Could not change the source:', cause instanceof Error ? cause.message : cause);
      toast({ tone: 'error', title: failedTitle, message: isKnownOffline() ? t('libraryPage.offlineNotSaved') : t('libraryPage.toggleFailedDesc') });
      return false;
    }
  }, [refuseOffline, t, toast, userId]);

  const move = useCallback(async (source: Source, folder: string): Promise<boolean> => {
    if (!userId || !source.debateId || folder === source.folder) return false;
    if (refuseOffline(t('libraryPage.saveFailed'))) return false;
    try {
      await updateSource(userId, source.debateId, source.id, { folder });
      toast({ tone: 'success', title: t('libraryPage.sourceUpdated'), message: `${t('libraryPage.folder')}: ${folderLabel(t, folder)}` });
      return true;
    } catch (cause) {
      console.warn('Could not move the source:', cause instanceof Error ? cause.message : cause);
      toast({ tone: 'error', title: t('libraryPage.saveFailed') });
      return false;
    }
  }, [refuseOffline, t, toast, userId]);

  const copy = useCallback(async (source: Source) => {
    try {
      await copyText(sourceText(source));
      toast({ tone: 'success', title: t('common.copied'), message: t('libraryPage.sourceCopied') });
    } catch {
      toast({ tone: 'error', title: t('common.error'), message: t('libraryPage.copyFailed') });
    }
  }, [t, toast]);

  const share = useCallback((source: Source) => {
    shareText(source.title, sourceText(source, true)).catch(() => {});
  }, []);

  return { remove, setActive, move, copy, share };
}
