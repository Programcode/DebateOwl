import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { NoticeTone } from '@/components/document';

import { useAuth } from './auth';
import { copyText, shareUrl } from './export';
import { haptics } from './haptics';
import { ShareLinkError, shareLinkFor, type ShareKind } from './share-links';

function failureText(t: TFunction, cause: unknown): string {
  if (!(cause instanceof ShareLinkError)) return t('mobile.share.failed');
  switch (cause.failure) {
    case 'signIn':
      return t('mobile.share.signIn');
    case 'limit':
      return t('mobile.share.limitReached', { limit: cause.limit ?? 50 });
    case 'tooLarge':
      return t('mobile.share.tooLarge');
    case 'timeout':
      return t('mobile.share.timeout');
    default:
      return t('mobile.share.failed');
  }
}

/**
 * A saved document's "Share link": make (or reuse) the link, then open the
 * share sheet with it. When the sheet cannot open, the link is copied instead.
 * Outcomes show in the document's own notice, which sits above its pinned
 * buttons; the toast would sit on them.
 */
export function useShareLink(setNotice: (text: string, tone?: NoticeTone) => void) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const owner = useRef(userId);
  const busy = useRef(false);
  useEffect(() => {
    owner.current = userId;
  }, [userId]);

  return useCallback(
    async (kind: ShareKind, savedId: string, title: string, itemData: unknown) => {
      if (!userId || busy.current) return;
      const forUser = userId;
      busy.current = true;
      let url: string;
      try {
        const link = await shareLinkFor(forUser, kind, savedId, title, itemData);
        url = link.url;
        if (owner.current !== forUser) return;
        if (link.created) haptics.success();
      } catch (cause) {
        console.warn('Could not create a share link:', cause instanceof Error ? cause.message : cause);
        if (owner.current !== forUser) return;
        haptics.warning();
        setNotice(failureText(t, cause));
        return;
      } finally {
        busy.current = false;
      }
      try {
        await shareUrl(title, url);
      } catch {
        try {
          await copyText(url);
          setNotice(t('mobile.share.linkCopied'), 'success');
        } catch {
          setNotice(t('mobile.share.failed'));
        }
      }
    },
    [setNotice, t, userId],
  );
}
