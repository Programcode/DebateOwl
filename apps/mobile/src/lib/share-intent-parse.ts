/**
 * What another app shared into DebateOwl (the share extension from
 * expo-share-intent), and where it lands: a web page becomes Add link with the
 * address filled in, any other text becomes a New note. Files are not taken.
 * No React Native or Expo imports, so it is unit-tested in Node; share-intent.ts
 * talks to the native module.
 */

/** The URL the share extension opens the app with: `debatelab://dataUrl=<key>?nonce=…#<type>`. */
const SHARE_URL = /^debatelab:\/\/dataUrl=/i;
/** The key the extension stores the shared item under in the App Group (`<scheme>ShareKey`). */
export const SHARE_KEY = 'debatelabShareKey';

const MAX_URL_LENGTH = 2048;
/** The Library's limit for a source's text (packages/core/src/source-file-import.ts). */
export const MAX_SHARED_TEXT = 120_000;
const MAX_TITLE = 80;

export type SharedItem =
  | { kind: 'link'; url: string; title?: string }
  | { kind: 'text'; text: string; title: string };

export function isShareIntentUrl(url: unknown): url is string {
  return typeof url === 'string' && SHARE_URL.test(url);
}

/** An http or https address on its own, without spaces or control characters. */
function webAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (!/^https?:\/\/[^\s/?#]+[^\s\u0000-\u001f]*$/i.test(trimmed)) return null;
  return trimmed;
}

function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const line = value.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1).trimEnd()}…` : line;
}

/** A note's title from its text: the first line that has words, shortened. */
export function noteTitleFrom(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  return cleanTitle(first) ?? '';
}

/**
 * Reads the native module's `onChange` value (a JSON string on iOS, an object
 * on Android) into what the app does with it, or null for nothing it can use.
 */
export function parseSharedItem(value: unknown): SharedItem | null {
  let payload: unknown = value;
  if (typeof value === 'string') {
    try {
      payload = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (payload === null || typeof payload !== 'object') return null;
  const shared = payload as { text?: unknown; weburls?: unknown; meta?: unknown };
  const meta = shared.meta !== null && typeof shared.meta === 'object' ? (shared.meta as { title?: unknown }) : {};

  if (Array.isArray(shared.weburls) && shared.weburls.length > 0) {
    const first = shared.weburls[0] as { url?: unknown; meta?: unknown } | null;
    const url = webAddress(first?.url);
    if (url) {
      let pageMeta: { title?: unknown } = {};
      if (typeof first?.meta === 'string') {
        try {
          const parsed: unknown = JSON.parse(first.meta);
          if (parsed !== null && typeof parsed === 'object') pageMeta = parsed as { title?: unknown };
        } catch {
          // A page without readable metadata still has its address.
        }
      }
      return { kind: 'link', url, title: cleanTitle(pageMeta.title) ?? cleanTitle(meta.title) };
    }
  }

  if (typeof shared.text === 'string') {
    const url = webAddress(shared.text);
    if (url) return { kind: 'link', url, title: cleanTitle(meta.title) };
    const text = shared.text.trim().slice(0, MAX_SHARED_TEXT);
    if (!text) return null;
    return { kind: 'text', text, title: cleanTitle(meta.title) ?? noteTitleFrom(text) };
  }
  return null;
}

/**
 * The sheet a shared item opens. What was shared never travels in the route:
 * share-intent.ts holds it for the sheet, and the route only says it is there,
 * so a link from anywhere else (debatelab://add-link?url=…) cannot start an
 * import or fill in a note.
 */
export function sharedItemRoute(item: SharedItem): { pathname: '/add-link' | '/new-note'; params: { shared: '1' } } {
  return { pathname: item.kind === 'link' ? '/add-link' : '/new-note', params: { shared: '1' } };
}
