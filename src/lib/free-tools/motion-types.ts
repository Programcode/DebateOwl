export const MOTION_TOPICS = [
  'education',
  'technology',
  'environment',
  'economics',
  'politics',
  'health',
  'sport',
  'culture',
  'ethics',
  'international',
  'justice',
  'society',
] as const;
export type MotionTopic = (typeof MOTION_TOPICS)[number];

export const MOTION_DIFFICULTIES = ['novice', 'intermediate', 'advanced'] as const;
export type MotionDifficulty = (typeof MOTION_DIFFICULTIES)[number];

/** policy "This House would", value "This House believes that", actor "This House, as X, would", regret, prefer. */
export const MOTION_TYPES = ['policy', 'value', 'actor', 'regret', 'prefer'] as const;
export type MotionType = (typeof MOTION_TYPES)[number];

export interface PracticeMotion {
  /** Stable permalink id (`?m=`): topic prefix and number, never renumbered. */
  id: string;
  /** BP and World Schools wording: "This House would ...". */
  motion: string;
  /** US-format wording: "Resolved: ...". */
  resolved: string;
  topic: MotionTopic;
  difficulty: MotionDifficulty;
  type: MotionType;
  /** Optional one-sentence context for an unfamiliar term; plain English. */
  infoSlide?: string;
}
