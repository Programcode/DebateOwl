import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { oauthCallback } from './oauth-callback';
import { supabase } from './supabase';

/**
 * Sign in with Apple and with Google, into the same Supabase accounts the
 * website signs in to.
 *
 * Apple: the system sheet gives an identity token for the app's bundle id,
 * which Supabase checks against the Apple provider's client IDs
 * (`signInWithIdToken`). The nonce is sent hashed to Apple and raw to
 * Supabase, which hashes it again to match, so a token cannot be replayed.
 * Apple tells the app the student's name once, on the first sign-in only, so
 * it is saved to the account then.
 *
 * Google: the website's OAuth flow in an ASWebAuthenticationSession, which
 * hands the redirect straight back to the app (no other app can catch it), and
 * PKCE, so the code is useless without the verifier this client keeps.
 *
 * Each turns on from app.config.ts (`extra.signInWithApple`,
 * `extra.googleSignIn`), which sets them only for builds that can finish the
 * flow; Expo Go's config never has them. The Supabase providers and the
 * redirect URL are set up as docs/apple-platform.md says.
 */

export type SocialOutcome = 'signed-in' | 'cancelled';

/** The redirect Google sign-in returns to; it must be in Supabase Auth's redirect allow list. */
export const OAUTH_REDIRECT = 'debatelab://auth/callback';

const extra = () => (Constants.expoConfig?.extra ?? {}) as { signInWithApple?: unknown; googleSignIn?: unknown };

export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || extra().signInWithApple !== true) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export function googleSignInAvailable(): boolean {
  return Platform.OS === 'ios' && extra().googleSignIn === true;
}

function isCancel(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === 'ERR_REQUEST_CANCELED';
}

export async function signInWithApple(): Promise<SocialOutcome> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (cause) {
    if (isCancel(cause)) return 'cancelled';
    throw cause;
  }
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;

  // Only the first sign-in carries the name; a failure to save it does not undo the sign-in.
  const given = credential.fullName?.givenName?.trim();
  const family = credential.fullName?.familyName?.trim();
  if (given || family) {
    const fullName = [given, family].filter(Boolean).join(' ');
    const { error: nameError } = await supabase.auth.updateUser({
      data: { full_name: fullName, ...(given ? { given_name: given } : {}), ...(family ? { family_name: family } : {}) },
    });
    if (nameError) console.warn('Could not save the name from Apple:', nameError.message);
  }
  return 'signed-in';
}

export async function signInWithGoogle(): Promise<SocialOutcome> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in did not start.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
  if (result.type !== 'success') return 'cancelled';
  const callback = oauthCallback(result.url, OAUTH_REDIRECT);
  if (callback.kind === 'error') {
    // The student pressed Cancel on Google's own page.
    if (callback.code === 'access_denied') return 'cancelled';
    throw new Error(callback.message);
  }
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(callback.code);
  if (exchangeError) throw exchangeError;
  return 'signed-in';
}
