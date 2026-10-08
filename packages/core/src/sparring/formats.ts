import type { SparringFormat, SparringSide } from '../ai/schemas/sparring';

export type SparringTurnKind = 'introductor' | 'r1' | 'r2' | 'conclusor' | 'opening' | 'constructive' | 'rebuttal' | 'summary' | 'final';

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
    name: 'School 4-6-6-3',
    shortDescription: 'Your school format: Introductor, R1, R2, and Conclusor for both sides.',
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
    { label: 'Pro Introductor', side: 'pro', kind: 'introductor', timeLimitSeconds: 4 * 60 },
    { label: 'Con Introductor', side: 'con', kind: 'introductor', timeLimitSeconds: 4 * 60 },
    { label: 'Pro R1', side: 'pro', kind: 'r1', timeLimitSeconds: 6 * 60 },
    { label: 'Con R1', side: 'con', kind: 'r1', timeLimitSeconds: 6 * 60 },
    { label: 'Pro R2', side: 'pro', kind: 'r2', timeLimitSeconds: 6 * 60 },
    { label: 'Con R2', side: 'con', kind: 'r2', timeLimitSeconds: 6 * 60 },
    { label: 'Pro Conclusor', side: 'pro', kind: 'conclusor', timeLimitSeconds: 3 * 60 },
    { label: 'Con Conclusor', side: 'con', kind: 'conclusor', timeLimitSeconds: 3 * 60 },
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
