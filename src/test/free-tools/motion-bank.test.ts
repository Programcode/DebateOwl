import { describe, expect, it } from 'vitest';
import { PRACTICE_MOTIONS } from '@/lib/free-tools/practice-motions';
import { MOTION_TOPICS } from '@/lib/free-tools/motion-types';
import { drawMotions, filterMotions, filtersFromSearch, motionsFromSearch, NO_FILTERS, searchFor, type MotionFilters } from '@/lib/free-tools/motion-bank';

const PREFIX = { policy: 'This House would ', value: 'This House believes that ', actor: 'This House, as ', regret: 'This House regrets ', prefer: 'This House prefers ' } as const;

describe('practice motion bank', () => {
  it('has stable unique ids and both wordings for every motion', () => {
    // Ids are permalinks: a duplicate would send a shared link to the wrong motion.
    expect(new Set(PRACTICE_MOTIONS.map((motion) => motion.id)).size).toBe(PRACTICE_MOTIONS.length);
    for (const motion of PRACTICE_MOTIONS) {
      expect(motion.id).toMatch(/^[a-z]+-\d{3}$/);
      expect(motion.motion.startsWith(PREFIX[motion.type])).toBe(true);
      expect(motion.resolved).toMatch(/^Resolved: .+\.$/);
    }
    for (const topic of MOTION_TOPICS) expect(PRACTICE_MOTIONS.some((motion) => motion.topic === topic)).toBe(true);
  });

  it('filters by topic, difficulty and type together', () => {
    const picked = filterMotions(PRACTICE_MOTIONS, { topics: ['sport', 'health'], difficulties: ['novice'], types: ['policy'] });
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((motion) => ['sport', 'health'].includes(motion.topic) && motion.difficulty === 'novice' && motion.type === 'policy')).toBe(true);
    expect(filterMotions(PRACTICE_MOTIONS, NO_FILTERS)).toHaveLength(PRACTICE_MOTIONS.length);
  });

  it('draws distinct motions and avoids the ones just shown', () => {
    const pool = PRACTICE_MOTIONS.slice(0, 5);
    const three = drawMotions(pool, 3, () => 0);
    expect(three.map((motion) => motion.id)).toEqual([pool[0].id, pool[1].id, pool[2].id]);
    const next = drawMotions(pool, 2, () => 0, three.map((motion) => motion.id));
    expect(next.map((motion) => motion.id)).toEqual([pool[3].id, pool[4].id]);
    // Too few fresh ones left: draw from the whole pool rather than come up short.
    expect(drawMotions(pool, 3, () => 0.999, three.map((motion) => motion.id))).toHaveLength(3);
    expect(drawMotions([], 3)).toEqual([]);
  });

  it('round-trips permalinks and ignores what it does not know', () => {
    const filters: MotionFilters = { topics: ['education'], difficulties: ['advanced'], types: [] };
    const search = searchFor(filters, ['edu-019', 'edu-023'], 'resolved');
    expect(search).toBe('?m=edu-019%2Cedu-023&topic=education&level=advanced&wording=resolved');
    expect(filtersFromSearch(search)).toEqual(filters);
    expect(motionsFromSearch(PRACTICE_MOTIONS, search).map((motion) => motion.id)).toEqual(['edu-019', 'edu-023']);
    expect(motionsFromSearch(PRACTICE_MOTIONS, '?m=nope-001,edu-001,edu-001')).toHaveLength(1);
    expect(filtersFromSearch('?topic=education,<script>&level=expert')).toEqual({ topics: ['education'], difficulties: [], types: [] });
  });
});
