import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import { AttackOutputSchema } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import { GenerateOutputSchema } from '@debatelab/core/ai/schemas/generate';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AttackDocument } from '@/components/attack-document';
import { BrainstormDocument } from '@/components/brainstorm-document';
import { PrimaryButton } from '@/components/buttons';
import { CaseDocument } from '@/components/case-document';
import type { CitationTarget } from '@/components/citation-target';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader, type HeaderAction, type HeaderButton } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { EmptyState } from '@/components/empty-state';
import { FactoidsDocument } from '@/components/factoids-document';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { isShareCode } from '@/lib/deep-links';
import { isCompleteAttack, isCompleteCase, readBrainstorm, readFactoids } from '@/lib/results';
import { readSharedItem, type SharedItem } from '@/lib/share-links';
import { websiteShareUrl } from '@/lib/website';

type Shown =
  | { kind: 'case'; output: GenerateOutput }
  | { kind: 'attack'; output: AttackOutput }
  | { kind: 'brainstorm'; output: BrainstormOutput }
  | { kind: 'factoids'; output: FactoidsOutput };

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; item: SharedItem; shown: Shown | null };

/**
 * Shared data is public input, so, as on the website's SharedPage, it is checked
 * against the tool's schema before a document renders it. Anything else opens
 * on the website.
 */
function readShared(item: SharedItem): Shown | null {
  // A reader that normalises before its schema check can throw on hostile data (a `toString` that is not a
  // function); that is unreadable data, shown with the website fallback, never a screen stuck loading.
  try {
    return readSharedUnchecked(item);
  } catch {
    return null;
  }
}

function readSharedUnchecked(item: SharedItem): Shown | null {
  switch (item.itemType) {
    case 'case':
    case 'generate': {
      const parsed = GenerateOutputSchema.safeParse(item.itemData);
      return parsed.success && isCompleteCase(parsed.data) ? { kind: 'case', output: parsed.data } : null;
    }
    case 'attack': {
      const parsed = AttackOutputSchema.safeParse(item.itemData);
      return parsed.success && isCompleteAttack(parsed.data) ? { kind: 'attack', output: parsed.data } : null;
    }
    case 'brainstorm': {
      const output = readBrainstorm(item.itemData);
      return output ? { kind: 'brainstorm', output } : null;
    }
    case 'factoids': {
      const output = readFactoids(item.itemData);
      return output ? { kind: 'factoids', output } : null;
    }
    default:
      return null;
  }
}

/** A citation on a shared copy opens only a web address: the reader has no Library of the sharer's. */
function openSharedCitation(target: CitationTarget | undefined) {
  if (target?.url && /^https?:\/\//i.test(target.url)) void WebBrowser.openBrowserAsync(target.url);
}

/**
 * A shared result, opened from a debateowl.com/share link or the app's own
 * scheme: read-only, signed in or not, with the website as the fallback.
 */
export default function SharedItemScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  // debatelab://share/<anything> reaches this screen without the native intent's check.
  const code = isShareCode(raw) ? raw : null;
  const [held, setHeld] = useState<{ code: string | null; state: State }>({ code, state: { status: 'loading' } });
  const state: State = !code ? { status: 'missing' } : held.code === code ? held.state : { status: 'loading' };

  useEffect(() => {
    if (!code) return;
    let active = true;
    void readSharedItem(code)
      .then((read) => {
        if (!active) return;
        setHeld({ code, state: read.status === 'found' ? { status: 'ready', item: read.item, shown: readShared(read.item) } : read });
      })
      .catch(() => {
        if (active) setHeld({ code, state: { status: 'failed' } });
      });
    return () => {
      active = false;
    };
  }, [code]);

  const openWebsite = () => {
    if (code) void WebBrowser.openBrowserAsync(websiteShareUrl(code));
  };
  // Opened from a link, the screen may be the only one: Done leaves for the app's start, or sign-in when signed out.
  const buttons: HeaderButton[] = router.canGoBack()
    ? []
    : [{ key: 'done', label: t('mobile.common.done'), symbol: 'xmark', icon: 'x', onPress: () => router.replace(session ? '/' : '/sign-in') }];
  const actions: HeaderAction[] = code
    ? [{ key: 'website', label: t('mobile.share.openWebsite'), symbol: 'safari', icon: 'globe', onPress: openWebsite }]
    : [];
  const header = <DocumentHeader backLabel={t('common.back')} actions={actions} buttons={buttons} />;

  if (state.status === 'loading') {
    return (
      <DocumentScreen header={header}>
        <DocumentStatus status="loading" />
      </DocumentScreen>
    );
  }

  const fallback = (title: string, description: string): ReactNode => (
    <DocumentScreen header={header} testID="shared-fallback">
      <View style={styles.fallback}>
        <EmptyState pose="surprised" title={title} description={description}>
          {code ? <PrimaryButton icon="globe" label={t('mobile.share.openWebsite')} onPress={openWebsite} testID="shared-open-website" /> : null}
        </EmptyState>
      </View>
    </DocumentScreen>
  );

  if (state.status === 'missing') return fallback(t('sharedPage.notFoundTitle'), code ? t('sharedPage.contentNotFound') : t('sharedPage.noCode'));
  if (state.status === 'failed') return fallback(t('sharedPage.notFoundTitle'), t('sharedPage.loadFailed'));

  const { item, shown } = state;
  const title = item.title || t('sharedPage.title');
  if (!shown) return fallback(title, t('mobile.share.unknownKind'));

  const date = formatDate(item.createdAt);
  return (
    <DocumentScreen header={header} outline testID="shared-document">
      <DocumentTitle title={title} meta={date ? `${t('sharedPage.sharedOn')} ${date}` : undefined} />
      {shown.kind === 'case' ? <CaseDocument output={shown.output} library={[]} sources={[]} onCite={openSharedCitation} /> : null}
      {shown.kind === 'attack' ? <AttackDocument output={shown.output} sources={[]} /> : null}
      {shown.kind === 'brainstorm' ? <BrainstormDocument output={shown.output} input={{}} sources={[]} /> : null}
      {shown.kind === 'factoids' ? <FactoidsDocument output={shown.output} input={{}} library={[]} sources={[]} onCite={openSharedCitation} /> : null}
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  fallback: { marginTop: 24 },
});
