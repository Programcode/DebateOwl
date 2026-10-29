import { requireOptionalNativeModule } from 'expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { nativeCapabilities } from './native-capabilities';
import { parseSharedItem, SHARE_KEY, sharedItemRoute, type SharedItem } from './share-intent-parse';

/**
 * Text and web pages shared from Safari or any other app. The share extension
 * (expo-share-intent, in a development build with the App Group) stores the
 * item in the App Group and opens `debatelab://dataUrl=…`; +native-intent.tsx
 * hands that URL here instead of routing it. The module reads the item back
 * and the app opens Add link or New note with it filled in
 * (share-intent-parse.ts). Expo Go and builds without the package have no
 * module, so nothing here runs there.
 */

type ShareIntentModule = {
  getShareIntent: (url: string) => Promise<void>;
  clearShareIntent: (key: string) => void;
  addListener: (event: 'onChange' | 'onError', listener: (event: { value?: unknown }) => void) => { remove: () => void };
};

// The URL arrives before the root layout mounts on a cold start, so it waits here.
let pendingUrl: string | null = null;
const urlListeners = new Set<(url: string) => void>();

// The shared text New note opens with, read once.
let heldNote: { text: string; title: string } | null = null;

/** The shared note New note was opened for, if any; `forget` once it is in the form. */
export function sharedNote(): { text: string; title: string } | null {
  return heldNote;
}

export function forgetSharedNote(): void {
  heldNote = null;
}

/** Called by +native-intent.tsx with the share extension's URL. */
export function receiveShareUrl(url: string): void {
  pendingUrl = url;
  urlListeners.forEach((listener) => listener(url));
}

/**
 * Opens what was shared. Call it in the root layout's Root component with its
 * `ready`, like useQuickActions: the item waits until the stack is mounted and
 * someone is signed in, because the sheets it opens add to the Current Debate.
 */
export function useShareIntent(ready: boolean): void {
  const router = useRouter();
  const { session } = useAuth();
  const [item, setItem] = useState<SharedItem | null>(null);

  useEffect(() => {
    if (!nativeCapabilities().shareIntent) return;
    const native = requireOptionalNativeModule<ShareIntentModule>('ExpoShareIntentModule');
    if (!native) return;
    const changed = native.addListener('onChange', (event) => {
      const next = parseSharedItem(event.value);
      // Read once: the item does not open again on the next launch.
      try {
        native.clearShareIntent(SHARE_KEY);
      } catch {
        // Nothing to clear.
      }
      if (next) setItem(next);
    });
    const failed = native.addListener('onError', (event) => {
      console.warn('Could not read what was shared:', typeof event.value === 'string' ? event.value : 'unknown error');
    });
    const read = (url: string) => {
      pendingUrl = null;
      native.getShareIntent(url).catch((cause: unknown) => console.warn('Could not read what was shared:', cause instanceof Error ? cause.message : cause));
    };
    urlListeners.add(read);
    if (pendingUrl) read(pendingUrl);
    return () => {
      urlListeners.delete(read);
      changed.remove();
      failed.remove();
    };
  }, []);

  const signedIn = session !== null;
  useEffect(() => {
    if (!item || !ready || !signedIn) return;
    // After the stack has committed its first screens, as useQuickActions does.
    const timer = setTimeout(() => {
      setItem(null);
      heldNote = item.kind === 'text' ? { text: item.text, title: item.title } : null;
      router.push(sharedItemRoute(item));
    }, 0);
    return () => clearTimeout(timer);
  }, [item, ready, signedIn, router]);
}
