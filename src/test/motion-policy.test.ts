import { describe, expect, it } from 'vitest';
import { getRouteMotion, ROUTE_TRANSITION_DURATION_SECONDS } from '@/lib/motion-policy';

describe('motion policy', () => {
  it('keeps route transitions below the 180ms limit', () => {
    expect(ROUTE_TRANSITION_DURATION_SECONDS).toBeLessThan(0.18);
    expect(getRouteMotion(false).transition.duration).toBe(ROUTE_TRANSITION_DURATION_SECONDS);
  });

  it('removes route movement when reduced motion is requested', () => {
    const policy = getRouteMotion(true);

    expect(policy.initial).toEqual({ opacity: 1 });
    expect(policy.exit).toEqual({ opacity: 1 });
    expect(policy.transition.duration).toBe(0);
  });
});
