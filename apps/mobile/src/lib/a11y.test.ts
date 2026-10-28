import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ AccessibilityInfo: { announceForAccessibility: vi.fn() } }));
vi.mock('./i18n', () => ({ default: { t: (key: string) => key } }));

import { spokenText } from './a11y';

describe('spokenText', () => {
  it('reads an answer without Markdown marks, link targets or citation numbers', () => {
    expect(spokenText('## Short answer\n\n**Yes.** Free buses [cut traffic](https://example.org) by 9% [2].\n\n- first\n- second'))
      .toBe('Short answer Yes. Free buses cut traffic by 9%. first second');
  });

  it('stops a long answer at a sentence, so VoiceOver never reads the whole page', () => {
    const answer = `${'Free buses cut traffic. '.repeat(30)}`;
    const spoken = spokenText(answer, 100);
    expect(spoken.length).toBeLessThanOrEqual(101);
    expect(spoken.endsWith('traffic.')).toBe(true);
  });
});
