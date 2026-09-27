import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore, type AttachKind } from '@/lib/stores/session-store';
import { useSparringStore } from '@/lib/stores/sparring-store';
import type { DebateSide } from '@/lib/stores/debate-store';

export type DebateItemKind = Exclude<AttachKind, 'source'> | 'sparring';

/** One saved result, whatever tool produced it. */
export interface DebateItem {
  id: string;
  kind: DebateItemKind;
  title: string;
  /** Exact motion recorded with the work, when the tool had one. */
  motion?: string;
  side: DebateSide | null;
  debateId: string | null;
  createdAt: number;
}

export const ITEM_ROUTES: Record<DebateItemKind, string> = {
  case: '/app/generate',
  attack: '/app/attack',
  brainstorm: '/app/brainstorm',
  factoids: '/app/factoids',
  chat: '/app/ask',
  flowchart: '/app/flowchart',
  crossfire: '/app/crossfire',
  sparring: '/app/sparring',
};

function motionOf(data: unknown): string | undefined {
  const metadata = (data as { metadata?: { motion?: unknown } } | null)?.metadata;
  return typeof metadata?.motion === 'string' ? metadata.motion : undefined;
}

/** Every saved result across tools, newest first. Filter by debate at the call site. */
export function useAllDebateItems(): DebateItem[] {
  const savedCases = useSessionStore((state) => state.savedCases);
  const savedAttacks = useSessionStore((state) => state.savedAttacks);
  const savedBrainstorms = useSessionStore((state) => state.savedBrainstorms);
  const savedFactoids = useSessionStore((state) => state.savedFactoids);
  const savedChats = useSessionStore((state) => state.savedChats);
  const savedFlowcharts = useSessionStore((state) => state.savedFlowcharts);
  const savedCrossfires = useSessionStore((state) => state.savedCrossfires);
  const sparringSessions = useSparringStore((state) => state.savedSessions);

  return useMemo(() => {
    const items: DebateItem[] = [];
    const push = (kind: DebateItemKind, list: Array<{ id: string; title: string; data: unknown; createdAt: number; debateId?: string | null; side?: DebateSide | null }>) => {
      for (const item of list) {
        items.push({
          id: item.id,
          kind,
          title: item.title,
          motion: motionOf(item.data),
          side: item.side ?? null,
          debateId: item.debateId ?? null,
          createdAt: item.createdAt,
        });
      }
    };
    push('case', savedCases);
    push('attack', savedAttacks);
    push('brainstorm', savedBrainstorms);
    push('factoids', savedFactoids);
    push('chat', savedChats);
    push('flowchart', savedFlowcharts);
    push('crossfire', savedCrossfires);
    for (const session of sparringSessions) {
      items.push({
        id: session.id,
        kind: 'sparring',
        title: session.motion,
        motion: session.motion,
        side: session.userSide,
        debateId: session.debateId ?? null,
        createdAt: session.updatedAt,
      });
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [savedAttacks, savedBrainstorms, savedCases, savedChats, savedCrossfires, savedFactoids, savedFlowcharts, sparringSessions]);
}

/** Loads a saved item back into its tool. Returns false when the tool cannot reopen it. */
export function useOpenDebateItem() {
  const navigate = useNavigate();
  const session = useSessionStore();
  const loadSparringSession = useSparringStore((state) => state.loadSavedSession);

  return (item: DebateItem): boolean => {
    switch (item.kind) {
      case 'case': session.loadSavedCase(item.id); break;
      case 'attack': session.loadSavedAttack(item.id); break;
      case 'brainstorm': session.loadSavedBrainstorm(item.id); break;
      case 'factoids': session.loadSavedFactoids(item.id); break;
      case 'chat': session.loadSavedChat(item.id); break;
      case 'flowchart': {
        const flowchart = session.savedFlowcharts.find((candidate) => candidate.id === item.id);
        if (!flowchart) return false;
        session.setPendingFlowchartData(flowchart.data);
        break;
      }
      case 'sparring': loadSparringSession(item.id); break;
      case 'crossfire': return false;
    }
    navigate(ITEM_ROUTES[item.kind]);
    return true;
  };
}
