import { describe, expect, it } from 'vitest';

import { continuedRoute, handoffTarget } from './app-intent-links';

describe('handoffTarget', () => {
  it('continues a tool on its website page', () => {
    expect(handoffTarget('/')).toEqual({ webPath: '/app', titleKey: 'nav.currentDebate' });
    expect(handoffTarget('/generate')?.webPath).toBe('/app/generate');
    expect(handoffTarget('/library/')?.webPath).toBe('/app/library');
    expect(handoffTarget('/you')?.webPath).toBe('/app/settings');
    expect(handoffTarget('/timer')?.webPath).toBe('/tools/debate-timer');
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
  });

  it('refuses anything else', () => {
    expect(continuedRoute('/sign-in')).toBeNull();
    expect(continuedRoute('//evil.example/case/abc')).toBeNull();
    expect(continuedRoute('debatelab://timer')).toBeNull();
    expect(continuedRoute('https://evil.example/app/library')).toBeNull();
    expect(continuedRoute(42)).toBeNull();
  });
});
