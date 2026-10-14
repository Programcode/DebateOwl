import type { SparringScorecard } from '@debatelab/core/ai/schemas/sparring';
import type { SparringSession } from '@debatelab/core/sparring/session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DocumentScreen } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { DocumentStatus } from '@/components/document-status';
import { SparringScorecardScreen } from '@/components/sparring-views';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { fetchSparringRound, sparringDraft } from '@/lib/sparring';

type Judged = SparringSession & { scorecard: SparringScorecard };
type State = { status: 'loading' } | { status: 'missing' } | { status: 'failed' } | { status: 'ready'; round: Judged };

function judged(session: SparringSession | null | undefined, id: string): Judged | null {
  return session?.id === id && session.phase === 'complete' && session.scorecard ? { ...session, scorecard: session.scorecard } : null;
}

/**
 * A saved round reopened from Practice or the Debate tab, as the website's
 * history loads a saved session back into Sparring: the scorecard, Replay
 * for the transcript, share and delete.
 */
export default function SavedSparringScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // The state remembers whose round it holds, so another account never sees it while its own read runs.
  const [held, setHeld] = useState<{ owner: string | null; state: State }>(() => {
    const kept = judged(sparringDraft.get(), id);
    return { owner: userId, state: kept ? { status: 'ready', round: kept } : { status: 'loading' } };
  });
  const state: State = held.owner === userId ? held.state : { status: 'loading' };

  useEffect(() => {
    if (judged(sparringDraft.get(), id) || !userId) return;
    const forUser = userId;
    let active = true;
    fetchSparringRound(forUser, id)
      .then((round) => {
        if (!active) return;
        const ready = judged(round, id);
        setHeld({ owner: forUser, state: ready ? { status: 'ready', round: ready } : { status: 'missing' } });
      })
      .catch((cause: unknown) => {
        console.warn('Could not load the round:', cause instanceof Error ? cause.message : cause);
        if (active) setHeld({ owner: forUser, state: { status: 'failed' } });
      });
    return () => {
      active = false;
    };
  }, [id, userId]);

  if (state.status !== 'ready') {
    return (
      <DocumentScreen header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}>
        <DocumentStatus status={state.status} />
      </DocumentScreen>
    );
  }

  const forget = () => {
    // The finished round on the Sparring screen is this one; another round, finished or not, stays.
    if (sparringDraft.get()?.id === id) sparringDraft.set(null);
  };

  return (
    <SparringScorecardScreen
      session={state.round}
      from={from}
      onRestart={() => {
        forget();
        router.replace({ pathname: '/sparring', params: { from } });
      }}
      onDeleted={() => {
        forget();
        router.back();
      }}
    />
  );
}
