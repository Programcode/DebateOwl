import { describe, expect, it } from 'vitest';
import { encodeCustomFormat, roundFormatToCustom } from '@debatelab/core/free-tools/custom-format';
import { FORMATS } from '@debatelab/core/free-tools/formats';

import { continuedRoute, handoffTarget } from './app-intent-links';

describe('handoffTarget', () => {
  it('continues a tool on its website page', () => {
    expect(handoffTarget('/')).toEqual({ webPath: '/app', titleKey: 'nav.currentDebate' });
    expect(handoffTarget('/generate')?.webPath).toBe('/app/generate');
    expect(handoffTarget('/library/')?.webPath).toBe('/app/library');
    expect(handoffTarget('/you')?.webPath).toBe('/app/settings');
    expect(handoffTarget('/timer')?.webPath).toBe('/tools/debate-timer');
    expect(handoffTarget('/flow-sheet')?.webPath).toBe('/tools/debate-flow-sheet');
    expect(handoffTarget('/flowchart/claim')?.webPath).toBe('/app/flowchart');
  });

  it('sends a saved document to its History tab and keeps share codes', () => {
    expect(handoffTarget('/case/3f2a-9c')?.webPath).toBe('/app/history?tab=cases');
    expect(handoffTarget('/crossfire-round/abc')?.webPath).toBe('/app/history?tab=crossfire');
    expect(handoffTarget('/source/abc')?.webPath).toBe('/app/library');
    expect(handoffTarget('/share/Ab3dEf7hIj9kLm0n')?.webPath).toBe('/share/Ab3dEf7hIj9kLm0n');
  });

  it('offers nothing for sign-in, unknown screens or odd ids', () => {
    expect(handoffTarget('/sign-in')).toBeNull();
    expect(handoffTarget('/nowhere')).toBeNull();
    expect(handoffTarget('/case/a/b')).toBeNull();
    expect(handoffTarget('/case/a%2Fb')).toBeNull();
    expect(handoffTarget('/share/has space')).toBeNull();
  });
});

describe('continuedRoute', () => {
  it('opens routes Handoff offers and website links the app opens', () => {
    expect(continuedRoute('/case/abc')).toBe('/case/abc');
    expect(continuedRoute('https://debateowl.com/app/library')).toBe('/library');
    expect(continuedRoute('https://debateowl.com/tools/debate-timer')).toBe('/timer');
  });

  it('carries custom timer formats through Handoff beyond the app-path length limit', () => {
    const format = roundFormatToCustom(FORMATS.wsdc);
    format.segments = format.segments.map((segment) => ({ ...segment, label: 'x'.repeat(40) }));
    const custom = encodeCustomFormat(format);
    const url = `https://debateowl.com/tools/debate-timer?custom=${custom}`;
    expect(url.length).toBeGreaterThan(512);
    expect(continuedRoute(url)).toBe(`/timer?custom=${custom}`);
    expect(continuedRoute(`https://debateowl.com/tools/debate-timer?custom=${'a'.repeat(5000)}`)).toBeNull();
  });

  it('opens History for a result only the other device has', () => {
    expect(continuedRoute('/case/local-1730000000000-1')).toBe('/history');
    expect(continuedRoute('/attack/local-1730000000000-2')).toBe('/history');
  });

  it('refuses anything else', () => {
    expect(continuedRoute('/sign-in')).toBeNull();
    expect(continuedRoute('//evil.example/case/abc')).toBeNull();
    expect(continuedRoute('debatelab://timer')).toBeNull();
    expect(continuedRoute('https://evil.example/app/library')).toBeNull();
    expect(continuedRoute(42)).toBeNull();
  });
});
