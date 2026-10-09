import type { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

/** Where a citation chip leads: a Library source opens its detail, a web address opens the in-app browser. */
export interface CitationTarget {
  n: number;
  label: string;
  url?: string;
  sourceId?: string;
}

/** The first web address in a citation's source, as the website's getFirstUrl. */
export function firstUrl(text?: string): string | undefined {
  return text?.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;!?]+$/g, '');
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function shorten(text: string, max = 42): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function openCitation(router: ReturnType<typeof useRouter>, target: CitationTarget | undefined) {
  if (target?.sourceId) router.push({ pathname: '/source/[id]', params: { id: target.sourceId } });
  else if (target?.url) void WebBrowser.openBrowserAsync(target.url);
}
