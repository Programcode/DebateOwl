import type { SparringFormat, SparringSide } from '@/lib/ai/schemas/sparring';

export type SparringTurnKind = 'opening' | 'constructive' | 'rebuttal' | 'summary' | 'final';

export interface SparringTurn {
  id: string;
  label: string;
  side: SparringSide;
  speaker: 'user' | 'ai';
  kind: SparringTurnKind;
  timeLimitSeconds: number;
}

export interface SparringFormatDefinition {
  id: SparringFormat;
  name: string;
  shortDescription: string;
  turnCount: number;
  approximateMinutes: number;
}

const FORMAT_DEFINITIONS: Record<SparringFormat, SparringFormatDefinition> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    shortDescription: 'A full 4-6-6-3 team-style round with four speeches per side.',
    turnCount: 8,
    approximateMinutes: 38,
  },
  ld: {
    id: 'ld',
    name: 'Lincoln-Douglas',
    shortDescription: 'A focused values round with constructives and two rebuttal stages.',
    turnCount: 5,
    approximateMinutes: 26,
  },
  pf: {
    id: 'pf',
    name: 'Public Forum',
    shortDescription: 'Constructive, rebuttal, summary, and final focus for both sides.',
    turnCount: 8,
    approximateMinutes: 26,
  },
};

type TurnTemplate = Omit<SparringTurn, 'id' | 'speaker'>;

const TURN_TEMPLATES: Record<SparringFormat, TurnTemplate[]> = {
  standard: [
    { label: 'Pro opening', side: 'pro', kind: 'opening', timeLimitSeconds: 4 * 60 },
    { label: 'Con opening', side: 'con', kind: 'opening', timeLimitSeconds: 4 * 60 },
    { label: 'Pro first constructive', side: 'pro', kind: 'constructive', timeLimitSeconds: 6 * 60 },
    { label: 'Con first constructive', side: 'con', kind: 'constructive', timeLimitSeconds: 6 * 60 },
    { label: 'Pro second constructive', side: 'pro', kind: 'rebuttal', timeLimitSeconds: 6 * 60 },
    { label: 'Con second constructive', side: 'con', kind: 'rebuttal', timeLimitSeconds: 6 * 60 },
    { label: 'Pro conclusion', side: 'pro', kind: 'final', timeLimitSeconds: 3 * 60 },
    { label: 'Con conclusion', side: 'con', kind: 'final', timeLimitSeconds: 3 * 60 },
  ],
  ld: [
    { label: 'Affirmative constructive', side: 'pro', kind: 'constructive', timeLimitSeconds: 6 * 60 },
    { label: 'Negative constructive', side: 'con', kind: 'constructive', timeLimitSeconds: 7 * 60 },
    { label: 'First affirmative rebuttal', side: 'pro', kind: 'rebuttal', timeLimitSeconds: 4 * 60 },
    { label: 'Negative rebuttal', side: 'con', kind: 'rebuttal', timeLimitSeconds: 6 * 60 },
    { label: 'Second affirmative rebuttal', side: 'pro', kind: 'final', timeLimitSeconds: 3 * 60 },
  ],
  pf: [
    { label: 'Pro constructive', side: 'pro', kind: 'constructive', timeLimitSeconds: 4 * 60 },
    { label: 'Con constructive', side: 'con', kind: 'constructive', timeLimitSeconds: 4 * 60 },
    { label: 'Pro rebuttal', side: 'pro', kind: 'rebuttal', timeLimitSeconds: 4 * 60 },
    { label: 'Con rebuttal', side: 'con', kind: 'rebuttal', timeLimitSeconds: 4 * 60 },
    { label: 'Pro summary', side: 'pro', kind: 'summary', timeLimitSeconds: 3 * 60 },
    { label: 'Con summary', side: 'con', kind: 'summary', timeLimitSeconds: 3 * 60 },
    { label: 'Pro final focus', side: 'pro', kind: 'final', timeLimitSeconds: 2 * 60 },
    { label: 'Con final focus', side: 'con', kind: 'final', timeLimitSeconds: 2 * 60 },
  ],
};

export const SPARRING_FORMATS = Object.values(FORMAT_DEFINITIONS);

export function getSparringFormat(format: SparringFormat): SparringFormatDefinition {
  return FORMAT_DEFINITIONS[format];
}

export function buildSparringTurns(format: SparringFormat, userSide: SparringSide): SparringTurn[] {
  return TURN_TEMPLATES[format].map((turn, index) => ({
    ...turn,
    id: `${format}-${index + 1}`,
    speaker: turn.side === userSide ? 'user' : 'ai',
  }));
}

export function formatRoundTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}
