import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('navigation performance measurement', () => {
  it('starts the resource boundary before pointer-down can prefetch a route', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/measure-navigation-performance.mjs'), 'utf8');

    expect(source).toMatch(/startTransition\(target\) \{\s+const resourceBoundary = performance\.now\(\);/);
    expect(source).not.toContain('baseline.transition.resourceBoundary = clickTime');
  });
});
