/**
 * The redirect an OAuth sign-in comes back to, read: a PKCE `code`, or the
 * error the provider or Supabase Auth gives. Supabase puts errors in the
 * query or, for some, the fragment; a callback for another address is refused,
 * so a stray link can never be taken for a sign-in.
 */
export type OAuthCallback = { kind: 'code'; code: string } | { kind: 'error'; code: string; message: string };

export function oauthCallback(url: string, expected: string): OAuthCallback {
  const refused = (message: string): OAuthCallback => ({ kind: 'error', code: 'invalid_callback', message });
  const [address, rest = ''] = url.split('?', 2);
  const [base] = address.split('#', 1);
  if (base !== expected) return refused('The sign-in came back to an unexpected address.');
  const hashAt = rest.indexOf('#');
  const query = new URLSearchParams(hashAt === -1 ? rest : rest.slice(0, hashAt));
  const fragmentAt = url.indexOf('#');
  const fragment = new URLSearchParams(fragmentAt === -1 ? '' : url.slice(fragmentAt + 1));
  const read = (name: string) => query.get(name) ?? fragment.get(name);

  const error = read('error');
  if (error) return { kind: 'error', code: error, message: read('error_description') ?? error };
  const code = query.get('code');
  if (!code) return refused('The sign-in came back without a code.');
  return { kind: 'code', code };
}
