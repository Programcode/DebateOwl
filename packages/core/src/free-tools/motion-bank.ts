/** Filtering and random draws over the practice motion bank. */
import { MOTION_DIFFICULTIES, MOTION_TOPICS, MOTION_TYPES, type MotionDifficulty, type MotionTopic, type MotionType, type PracticeMotion } from './motion-types';

export interface MotionFilters {
  /** Empty means every topic; likewise for the others. */
  topics: MotionTopic[];
  difficulties: MotionDifficulty[];
  types: MotionType[];
}

export const NO_FILTERS: MotionFilters = { topics: [], difficulties: [], types: [] };

export type MotionWording = 'house' | 'resolved';

export const TOPIC_NAMES: Record<MotionTopic, string> = {
  education: 'Education',
  technology: 'Technology and AI',
  environment: 'Environment',
  economics: 'Economics',
  politics: 'Politics and democracy',
  health: 'Health',
  sport: 'Sport',
  culture: 'Culture and media',
  ethics: 'Ethics',
  international: 'International relations',
  justice: 'Justice and law',
  society: 'Society',
};

export function filterMotions(motions: readonly PracticeMotion[], filters: MotionFilters): PracticeMotion[] {
  return motions.filter((motion) =>
    (filters.topics.length === 0 || filters.topics.includes(motion.topic)) &&
    (filters.difficulties.length === 0 || filters.difficulties.includes(motion.difficulty)) &&
    (filters.types.length === 0 || filters.types.includes(motion.type)));
}

/**
 * Up to `count` different motions, chosen uniformly. `exclude` keeps the ones
 * just shown out of the next draw while enough others remain.
 */
export function drawMotions(
  pool: readonly PracticeMotion[],
  count: number,
  random: () => number = Math.random,
  exclude: readonly string[] = [],
): PracticeMotion[] {
  const fresh = pool.filter((motion) => !exclude.includes(motion.id));
  const source = [...(fresh.length >= count ? fresh : pool)];
  const picked: PracticeMotion[] = [];
  while (picked.length < count && source.length > 0) {
    const index = Math.min(source.length - 1, Math.floor(random() * source.length));
    picked.push(source.splice(index, 1)[0]);
  }
  return picked;
}

export function motionText(motion: PracticeMotion, wording: MotionWording): string {
  return wording === 'resolved' ? motion.resolved : motion.motion;
}

export function findMotion(motions: readonly PracticeMotion[], id: string | null | undefined): PracticeMotion | undefined {
  return id ? motions.find((motion) => motion.id === id) : undefined;
}

function listParam<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return [...new Set(value.split(',').filter((entry): entry is T => (allowed as readonly string[]).includes(entry)))];
}

/** Filters from `?topic=a,b&level=novice&type=policy`; unknown values are ignored. */
export function filtersFromSearch(search: string): MotionFilters {
  const params = new URLSearchParams(search);
  return {
    topics: listParam(params.get('topic'), MOTION_TOPICS),
    difficulties: listParam(params.get('level'), MOTION_DIFFICULTIES),
    types: listParam(params.get('type'), MOTION_TYPES),
  };
}

/** The search string for a shown motion and the filters that drew it: `?m=edu-004&topic=education`. */
export function searchFor(filters: MotionFilters, motionIds: readonly string[], wording: MotionWording): string {
  const params = new URLSearchParams();
  if (motionIds.length > 0) params.set('m', motionIds.join(','));
  if (filters.topics.length) params.set('topic', filters.topics.join(','));
  if (filters.difficulties.length) params.set('level', filters.difficulties.join(','));
  if (filters.types.length) params.set('type', filters.types.join(','));
  if (wording === 'resolved') params.set('wording', 'resolved');
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** The motions a permalink names, in order, skipping ids that do not exist; at most three. */
export function motionsFromSearch(motions: readonly PracticeMotion[], search: string): PracticeMotion[] {
  const ids = new URLSearchParams(search).get('m')?.split(',') ?? [];
  return [...new Set(ids)].slice(0, 3).map((id) => findMotion(motions, id)).filter((motion): motion is PracticeMotion => Boolean(motion));
}
