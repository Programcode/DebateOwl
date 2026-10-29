import { combineDelivery } from '@debatelab/core/voice/delivery';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { CrossfireDebriefDocument, CrossfireTranscript } from '@/components/crossfire-views';
import { DocumentScreen, DocumentTitle, SectionHeading } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { Text } from '@/components/text';
import { DeliverySummary } from '@/components/voice';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { fetchCrossfireRound, type SavedCrossfire } from '@/lib/crossfire';
import { formatWhen } from '@/lib/dates';
import { shareText } from '@/lib/export';
import { useCopyHolder } from '@/lib/use-copy-holder';

type State = { status: 'loading' } | { status: 'missing' } | { status: 'failed' } | { status: 'ready'; round: SavedCrossfire };

/**
 * A saved Crossfire round, read again: the debrief, the spoken delivery of a
 * voice round, and the transcript with its live signals, as the round's
 * last screen showed them. The website lists saved rounds but cannot open
 * them; this reads the same `crossfires` row it saves.
 */
export default function SavedCrossfireScreen() {
  const { t } = useTranslation();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // The state remembers whose round it holds, so another account never sees it while its own read runs.
  const [held, setHeld] = useState<{ owner: string | null; state: State }>({ owner: userId, state: { status: 'loading' } });
  const state: State = held.owner === userId ? held.state : { status: 'loading' };
  const copies = useCopyHolder();

  useEffect(() => {
    if (!userId) return;
    const forUser = userId;
    let active = true;
    fetchCrossfireRound(forUser, id, copies.mark())
      .then((round) => {
        if (active) setHeld({ owner: forUser, state: round ? { status: 'ready', round } : { status: 'missing' } });
      })
      .catch((cause: unknown) => {
        console.warn('Could not load the crossfire:', cause instanceof Error ? cause.message : cause);
        if (active) setHeld({ owner: forUser, state: { status: 'failed' } });
      });
    return () => {
      active = false;
    };
  }, [id, userId, copies]);

  const back = backLabel(t, from, 'debate');
  if (state.status !== 'ready') {
    return (
      <DocumentScreen header={<DocumentHeader backLabel={back} actions={[]} />}>
        <DocumentStatus status={state.status} />
      </DocumentScreen>
    );
  }

  const { round } = state;
  const resolution = round.config?.resolution || round.title;
  const delivery = combineDelivery(round.turns.flatMap((turn) => (turn.delivery ? [turn.delivery] : [])));
  const transcriptText = round.turns.map((turn) => `${turn.id} · ${t(turn.kind === 'question' ? 'crossfire.question' : 'crossfire.answer')}\n${turn.text}`).join('\n\n');

  return (
    <DocumentScreen
      testID="crossfire-saved"
      outline
      header={
        <DocumentHeader
          backLabel={back}
          onShare={() => void shareText(resolution, `${resolution}\n\n${transcriptText}`).catch(() => {})}
          actions={[]}
        />
      }>
      <DocumentTitle title={t('crossfire.debriefTitle')} meta={t('mobile.debate.itemMeta', { kind: t('debate.kinds.crossfire'), when: formatWhen(round.createdAt) })} />
      <Text weight="semibold" style={styles.resolution}>
        {resolution}
      </Text>
      {round.debrief ? <CrossfireDebriefDocument debrief={round.debrief} /> : null}
      {delivery ? <DeliverySummary delivery={delivery} /> : null}
      <SectionHeading title={t('crossfire.transcript')} />
      <CrossfireTranscript turns={round.turns} />
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  resolution: { fontSize: 17, lineHeight: 24, marginTop: -6 },
});
