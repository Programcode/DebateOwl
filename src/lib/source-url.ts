// Query parameters that only say where a click came from. Two links that differ
// only in these open the same page.
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_ga|_gl|ref_src)$/i;

/**
 * One key per web page: the host lower-cased without "www.", no scheme, no
 * fragment, no tracking parameters, no trailing slash. Null when it is not a URL.
 */
export function normalizeSourceUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.host.toLowerCase().replace(/^www\./, '');
  const params = new URLSearchParams();
  parsed.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAMS.test(key)) params.append(key, value);
  });
  const query = params.toString();
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/** The page a saved source came from: research keeps it in metadata, imports in origin. */
export function savedSourceUrl(source: { origin?: string; metadata?: { url?: string } }): string | null {
  const url = source.metadata?.url ?? source.origin;
  return url ? normalizeSourceUrl(url) : null;
}

/** The source in `debateId` that already holds this page, if any. */
export function findSavedPage<T extends { debateId?: string | null; origin?: string; metadata?: { url?: string } }>(
  sources: T[],
  debateId: string | null | undefined,
  url: string | undefined,
): T | undefined {
  const key = url ? normalizeSourceUrl(url) : null;
  if (!key || !debateId) return undefined;
  return sources.find((source) => source.debateId === debateId && savedSourceUrl(source) === key);
}
