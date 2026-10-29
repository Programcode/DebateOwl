/**
 * Where the share extension's URL waits for share-intent.ts. +native-intent.tsx
 * runs before the root layout mounts, so it only drops the URL here; this file
 * imports nothing, as deep-links.ts does, so the intent handler stays light.
 */

let pendingUrl: string | null = null;
const listeners = new Set<(url: string) => void>();

/** Called by +native-intent.tsx with the share extension's URL. */
export function receiveShareUrl(url: string): void {
  pendingUrl = url;
  listeners.forEach((listener) => listener(url));
}

/** Hands over a URL that arrived before anyone listened, then every new one. */
export function listenForShareUrls(listener: (url: string) => void): () => void {
  listeners.add(listener);
  if (pendingUrl) listener(pendingUrl);
  return () => {
    listeners.delete(listener);
  };
}

/** The URL has been read; it is not handed over again. */
export function takeShareUrl(): void {
  pendingUrl = null;
}
