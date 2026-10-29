import { describe, expect, it } from 'vitest';

import { oauthCallback } from './oauth-callback';

const REDIRECT = 'debatelab://auth/callback';

describe('OAuth callback', () => {
  it('reads the PKCE code', () => {
    expect(oauthCallback(`${REDIRECT}?code=abc-123`, REDIRECT)).toEqual({ kind: 'code', code: 'abc-123' });
  });

  it("reads the provider's error from the query or the fragment", () => {
    expect(oauthCallback(`${REDIRECT}?error=access_denied&error_description=User+cancelled`, REDIRECT)).toEqual({
      kind: 'error',
      code: 'access_denied',
      message: 'User cancelled',
    });
    expect(oauthCallback(`${REDIRECT}#error=server_error&error_description=Bad%20state`, REDIRECT)).toMatchObject({ code: 'server_error', message: 'Bad state' });
  });

  it('refuses another address, and a callback with neither code nor error', () => {
    expect(oauthCallback('debatelab://auth/callbackx?code=abc', REDIRECT)).toMatchObject({ kind: 'error', code: 'invalid_callback' });
    expect(oauthCallback('https://evil.example/auth/callback?code=abc', REDIRECT)).toMatchObject({ kind: 'error', code: 'invalid_callback' });
    expect(oauthCallback(REDIRECT, REDIRECT)).toMatchObject({ kind: 'error', code: 'invalid_callback' });
    // A code in the fragment is not the PKCE flow's answer.
    expect(oauthCallback(`${REDIRECT}#code=abc`, REDIRECT)).toMatchObject({ kind: 'error', code: 'invalid_callback' });
  });
});
