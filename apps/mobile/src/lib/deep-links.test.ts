import { describe, expect, it } from 'vitest';

import { appPathForUrl, isShareCode } from './deep-links';

describe('appPathForUrl', () => {
  it('opens a share link on either host', () => {
    expect(appPathForUrl('https://debateowl.com/share/Ab3dEf7hIj9kLm0n')).toBe('/share/Ab3dEf7hIj9kLm0n');
    expect(appPathForUrl('https://www.debateowl.com/share/Ab3dEf7hIj9kLm0n/')).toBe('/share/Ab3dEf7hIj9kLm0n');
    expect(appPathForUrl('HTTPS://DebateOwl.com/share/abc?lang=hu#top')).toBe('/share/abc');
  });

  it('maps the website app pages to app routes', () => {
    expect(appPathForUrl('https://debateowl.com/app')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/debate')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/generate')).toBe('/generate');
    expect(appPathForUrl('https://debateowl.com/app/Library/')).toBe('/library');
    expect(appPathForUrl('https://debateowl.com/app/settings?checkout=success')).toBe('/you');
    expect(appPathForUrl('https://debateowl.com/app/billing')).toBe('/you');
    expect(appPathForUrl('https://debateowl.com/app/history?tab=cases')).toBe('/history');
  });

  it('opens the Debate tab for app pages the app does not have', () => {
    expect(appPathForUrl('https://debateowl.com/app/admin')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/workspaces/123')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/constructor')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/__proto__')).toBe('/');
    expect(appPathForUrl('https://debateowl.com/app/%67enerate')).toBe('/');
  });

  it('honours only https on debateowl.com and www', () => {
    expect(appPathForUrl('http://debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl('https://evil.com/share/abc')).toBeNull();
    expect(appPathForUrl('https://debateowl.com.evil.com/share/abc')).toBeNull();
    expect(appPathForUrl('https://evil.debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl('https://debateowl.com@evil.com/share/abc')).toBeNull();
    expect(appPathForUrl('https://user@debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl('https://debateowl.com:8443/share/abc')).toBeNull();
    expect(appPathForUrl('https://debateowl.com./share/abc')).toBeNull();
    expect(appPathForUrl('https:/debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl('//debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl('debatelab://share/abc')).toBeNull();
  });

  it('rejects script and odd inputs', () => {
    expect(appPathForUrl('javascript:alert(1)//debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl(' https://debateowl.com/share/abc')).toBeNull();
    expect(appPathForUrl('')).toBeNull();
    expect(appPathForUrl(null)).toBeNull();
    expect(appPathForUrl(42)).toBeNull();
    expect(appPathForUrl(`https://debateowl.com/app/${'a'.repeat(3000)}`)).toBeNull();
  });

  it('rejects share links without exactly one valid code', () => {
    expect(appPathForUrl('https://debateowl.com/share')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/share/')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/share/abc/extra')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/share//abc')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/share/ab%2Fcd')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/share/..')).toBeNull();
    expect(appPathForUrl(`https://debateowl.com/share/${'a'.repeat(65)}`)).toBeNull();
    expect(appPathForUrl(`https://debateowl.com/share/${'a'.repeat(64)}`)).toBe(`/share/${'a'.repeat(64)}`);
  });

  it('ignores other website pages', () => {
    expect(appPathForUrl('https://debateowl.com/')).toBeNull();
    expect(appPathForUrl('https://debateowl.com')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/privacy')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/application')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/tools/flow-sheet')).toBeNull();
    expect(appPathForUrl('https://debateowl.com/tools/debate-timer/extra')).toBeNull();
  });

  it('opens the free tools the app has, for Handoff from Safari', () => {
    expect(appPathForUrl('https://debateowl.com/tools/debate-timer')).toBe('/timer');
    expect(appPathForUrl('https://www.debateowl.com/tools/speech-time-calculator?lang=es')).toBe('/speech-time');
    expect(appPathForUrl('https://debateowl.com/tools/debate-motion-generator/')).toBe('/motions');
  });
});

describe('isShareCode', () => {
  it('accepts the codes the share function makes and nothing looser', () => {
    expect(isShareCode('Ab3dEf7hIj9kLm0n')).toBe(true);
    expect(isShareCode('')).toBe(false);
    expect(isShareCode('a b')).toBe(false);
    expect(isShareCode('abc/../x')).toBe(false);
    expect(isShareCode(['abc'])).toBe(false);
    expect(isShareCode(undefined)).toBe(false);
  });
});
