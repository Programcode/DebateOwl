import Constants from 'expo-constants';

/**
 * The public website, from app.config.ts's extra.websiteUrl. Staging builds link
 * there too: the staging site is behind Vercel login, and Terms and Privacy
 * are the same pages.
 */
const websiteUrl = (Constants.expoConfig?.extra as { websiteUrl?: string } | undefined)?.websiteUrl ?? 'https://debateowl.com';

export function websitePage(path: '/terms' | '/privacy' | '/app/settings'): string {
  return `${websiteUrl}${path}`;
}

/** A shared item on the website, for when the app cannot show it. */
export function websiteShareUrl(code: string): string {
  return `${websiteUrl}/share/${encodeURIComponent(code)}`;
}
