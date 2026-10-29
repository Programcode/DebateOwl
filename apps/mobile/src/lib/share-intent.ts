import { requireOptionalNativeModule } from 'expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { nativeCapabilities } from './native-capabilities';
import { listenForShareUrls, takeShareUrl } from './share-inbox';
import { parseSharedItem, SHARE_KEY, sharedItemRoute, type SharedItem } from './share-intent-parse';

/**
 * Text and web pages shared from Safari or any other app. The share extension
 * (expo-share-intent, in a development build with the App Group) stores the
 * item in the App Group and opens `debatelab://dataUrl=…`; +native-intent.tsx
 * leaves that URL in share-inbox.ts instead of routing it. The module reads the item back
 * and the app opens Add link or New note with it filled in
 * (share-intent-parse.ts). Expo Go and builds without the package have no
 * module, so nothing here runs there.
 */

type ShareIntentModule = {
  getShareIntent: (url: string) => Promise<void>;
  clearShareIntent: (key: string) => void;
  addListener: (event: 'onChange' | 'onError', listener: (event: { value?: unknown }) => void) => { remove: () => void };
};

// What the sheet opened by the share extension fills in, read once. Only useShareIntent sets it,
// so the sheets' own route parameters can never start an import.
let held: SharedItem | null = null;

/** The shared item of this kind the sheet was opened for, if any; `forgetShared` once it is in the form. */
export function sharedItem<K extends SharedItem['kind']>(kind: K): Extract<SharedItem, { kind: K }> | null {
  return held?.kind === kind ? (held as Extract<SharedItem, { kind: K }>) : null;
}

export function forgetShared(): void {
  held = null;
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
    // A URL from a cold start waited in the inbox until now.
    const stopListening = listenForShareUrls((url) => {
      takeShareUrl();
      native.getShareIntent(url).catch((cause: unknown) => console.warn('Could not read what was shared:', cause instanceof Error ? cause.message : cause));
    });
    return () => {
      stopListening();
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
      held = item;
      router.push(sharedItemRoute(item));
    }, 0);
    return () => clearTimeout(timer);
  }, [item, ready, signedIn, router]);
}
