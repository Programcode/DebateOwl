import { describe, expect, it } from 'vitest';
import { shouldOpenExternalUrl } from '@/native-runtime';

describe('native runtime links', () => {
  it('opens same-tab web links outside the native WebView', () => {
    expect(shouldOpenExternalUrl(new URL('https://example.com/docs'))).toBe(true);
  });

  it('keeps custom app links inside the native app', () => {
    expect(shouldOpenExternalUrl(new URL('debatelab://app/settings'))).toBe(false);
  });
});
