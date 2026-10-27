import { describe, expect, it } from 'vitest';
import { authCallbackErrorFor, authCallbackUrl, legacyCallbackPath, readAuthCallbackParams, safeNextPath } from '@/lib/auth-callback';

describe('auth callback URLs', () => {
  it.each([
    ['/app/history', '/app/history'],
    ['/app', '/app'],
    ['/app/workspaces/invite', '/app/workspaces/invite'],
    [null, '/app'],
    ['', '/app'],
    ['/login', '/app'],
    ['//evil.example/app', '/app'],
    ['/app//evil.example', '/app'],
    ['/app/\\evil.example', '/app'],
    ['https://evil.example/app', '/app'],
    ['javascript:alert(1)', '/app'],
    ['/app/../login', '/app'],
    ['/application', '/app'],
  ])('only lets %s return to an in-app page (%s)', (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it('carries a deep link through the callback and drops anything else', () => {
    expect(authCallbackUrl('https://debateowl.com')).toBe('https://debateowl.com/auth/callback');
    expect(authCallbackUrl('https://debateowl.com', '/app')).toBe('https://debateowl.com/auth/callback');
    expect(authCallbackUrl('https://debateowl.com', '/app/history')).toBe('https://debateowl.com/auth/callback?next=%2Fapp%2Fhistory');
    expect(authCallbackUrl('https://debateowl.com', '//evil.example')).toBe('https://debateowl.com/auth/callback');
  });

  it.each([
    ['/', '?code=abc', '', '/auth/callback?code=abc'],
    ['/app', '?code=abc&sb_flow_id=0123456789abcdef', '', '/auth/callback?code=abc&sb_flow_id=0123456789abcdef'],
    ['/app/', '?error=access_denied&error_code=otp_expired', '', '/auth/callback?error=access_denied&error_code=otp_expired'],
    ['/', '', '#error=access_denied&error_code=otp_expired', '/auth/callback#error=access_denied&error_code=otp_expired'],
  ])('moves an old link to %s%s%s onto the callback route', (pathname, search, hash, expected) => {
    expect(legacyCallbackPath({ pathname, search, hash })).toBe(expected);
  });

  it.each([
    ['/', '', ''],
    ['/', '', '#short-answer'],
    ['/app/settings', '?checkout=success', ''],
    ['/app/history', '?code=abc', ''],
    ['/share/abc', '?code=abc', ''],
    ['/auth/callback', '?code=abc', ''],
  ])('leaves %s%s%s alone', (pathname, search, hash) => {
    expect(legacyCallbackPath({ pathname, search, hash })).toBeNull();
  });

  it('reads the code, its flow id and any error the auth server returned', () => {
    expect(readAuthCallbackParams(new URL('https://x.test/auth/callback?code=c1&sb_flow_id=0123456789abcdef&next=%2Fapp'))).toEqual({
      code: 'c1',
      flowId: '0123456789abcdef',
      error: null,
    });
    expect(readAuthCallbackParams(new URL('https://x.test/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'))).toEqual({
      code: null,
      flowId: null,
      error: 'link-expired',
    });
    expect(readAuthCallbackParams(new URL('https://x.test/auth/callback#error=server_error&error_description=x'))).toEqual({
      code: null,
      flowId: null,
      error: 'failed',
    });
    // A flow id outside auth-js's own shape never reaches a storage key.
    expect(readAuthCallbackParams(new URL('https://x.test/auth/callback?code=c1&sb_flow_id=../x')).flowId).toBeNull();
  });

  it('names why an exchange failed', () => {
    expect(authCallbackErrorFor({ code: 'pkce_code_verifier_not_found' })).toBe('other-browser');
    expect(authCallbackErrorFor({ code: 'flow_state_not_found' })).toBe('link-expired');
    expect(authCallbackErrorFor({ code: 'flow_state_expired' })).toBe('link-expired');
    expect(authCallbackErrorFor(new Error('network'))).toBe('failed');
  });
});
