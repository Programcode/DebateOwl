import { appPathForUrl } from '@/lib/deep-links';
import { receiveShareUrl } from '@/lib/share-inbox';
import { isReadableShareUrl, isShareIntentUrl } from '@/lib/share-intent-parse';

/**
 * Every URL the system hands the app passes here first (Expo Router's native
 * intent). Website links (universal links, once Associated Domains is set up)
 * become app routes: https://debateowl.com/share/<code> opens the shared item,
 * /app/<page> the matching tool. The app's own scheme (debatelab://), Expo Go's
 * exp:// and a plain launch pass through unchanged. Any other web address opens
 * the Debate tab, never a route taken from it. The share extension's
 * debatelab://dataUrl=… is not a route: share-intent.ts reads what was shared
 * and opens its sheet over the Debate tab.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (isShareIntentUrl(path)) {
      // Only the extension's own URL is read; anything else in its shape just opens the Debate tab.
      if (isReadableShareUrl(path)) receiveShareUrl(path);
      return '/';
    }
    if (!/^https?:/i.test(path)) return path;
    return appPathForUrl(path) ?? '/';
  } catch {
    return '/';
  }
}
