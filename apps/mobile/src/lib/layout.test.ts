import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' as string, isPad: false }));

vi.mock('react-native', () => ({
  Platform: platform,
  useWindowDimensions: () => ({ width: 0, height: 0, scale: 1, fontScale: 1 }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { layoutClassFor } from './layout';

describe('layoutClassFor', () => {
  beforeEach(() => {
    platform.OS = 'ios';
    platform.isPad = false;
  });

  it('keeps every iPhone on the phone layout, including a wide landscape window', () => {
    expect(layoutClassFor(390, false)).toBe('phone');
    expect(layoutClassFor(844, false)).toBe('phone');
    expect(layoutClassFor(1200, false)).toBe('phone');
  });

  it('uses the phone layout for a narrow iPad window', () => {
    expect(layoutClassFor(699, true)).toBe('phone');
    expect(layoutClassFor(600, true)).toBe('phone');
  });

  it('splits an iPad window from 700 points and widens it from 1100', () => {
    expect(layoutClassFor(700, true)).toBe('regular');
    expect(layoutClassFor(1024, true)).toBe('regular');
    expect(layoutClassFor(1099, true)).toBe('regular');
    expect(layoutClassFor(1100, true)).toBe('wide');
    expect(layoutClassFor(1366, true)).toBe('wide');
  });

  it('follows the window width in the web preview, where there is no iPad', () => {
    platform.OS = 'web';
    expect(layoutClassFor(390, false)).toBe('phone');
    expect(layoutClassFor(820, false)).toBe('regular');
    expect(layoutClassFor(1366, false)).toBe('wide');
  });
});
