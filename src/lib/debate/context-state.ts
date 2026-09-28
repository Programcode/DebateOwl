import { useMemo } from 'react';
import type { DebateContextFeature, DebateContextSide } from '../../../supabase/functions/_shared/debate-context';
import { useSessionStore, type SessionState } from '@/lib/stores/session-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useDebateContextStore } from '@/lib/stores/debate-context-store';
import { planDebateContext, type DebateContextInputs, type DebateContextPlan } from './context';

type ResultLists = Pick<SessionState, 'savedCases' | 'savedAttacks' | 'savedBrainstorms' | 'savedFactoids' | 'savedChats' | 'savedCrossfires'>;

function resultsFrom(state: ResultLists): DebateContextInputs['results'] {
  return {
    case: state.savedCases,
    attack: state.savedAttacks,
    brainstorm: state.savedBrainstorms,
    factoids: state.savedFactoids,
    chat: state.savedChats,
    crossfire: state.savedCrossfires,
  };
}

/** The plan for a request made right now, read from the stores. */
export function currentDebateContextPlan(
  feature: DebateContextFeature,
  side: DebateContextSide,
  debateId: string,
  options: { includeSources?: boolean } = {},
): DebateContextPlan {
  const session = useSessionStore.getState();
  const context = useDebateContextStore.getState();
  return planDebateContext(feature, side, debateId, {
    sourceLibrary: session.sourceLibrary,
    results: resultsFrom(session),
    sparringSessions: useSparringStore.getState().savedSessions,
    pins: context.pins[debateId] ?? [],
    override: context.overrides[feature],
    excludeChatId: feature === 'ask' ? session.askChatId : null,
  }, options);
}

/** The same plan, kept current for the Review control. */
export function useDebateContextPlan(
  feature: DebateContextFeature,
  side: DebateContextSide,
  debateId: string | null,
  options: { includeSources?: boolean } = {},
): DebateContextPlan | null {
  const sourceLibrary = useSessionStore((state) => state.sourceLibrary);
  const savedCases = useSessionStore((state) => state.savedCases);
  const savedAttacks = useSessionStore((state) => state.savedAttacks);
  const savedBrainstorms = useSessionStore((state) => state.savedBrainstorms);
  const savedFactoids = useSessionStore((state) => state.savedFactoids);
  const savedChats = useSessionStore((state) => state.savedChats);
  const savedCrossfires = useSessionStore((state) => state.savedCrossfires);
  const askChatId = useSessionStore((state) => state.askChatId);
  const sparringSessions = useSparringStore((state) => state.savedSessions);
  const pins = useDebateContextStore((state) => (debateId ? state.pins[debateId] : undefined));
  const override = useDebateContextStore((state) => state.overrides[feature]);
  const includeSources = options.includeSources;

  return useMemo(() => debateId ? planDebateContext(feature, side, debateId, {
    sourceLibrary,
    results: resultsFrom({ savedCases, savedAttacks, savedBrainstorms, savedFactoids, savedChats, savedCrossfires }),
    sparringSessions,
    pins: pins ?? [],
    override,
    excludeChatId: feature === 'ask' ? askChatId : null,
  }, { includeSources }) : null, [
    askChatId, debateId, feature, includeSources, override, pins, savedAttacks, savedBrainstorms, savedCases,
    savedChats, savedCrossfires, savedFactoids, side, sourceLibrary, sparringSessions,
  ]);
}
