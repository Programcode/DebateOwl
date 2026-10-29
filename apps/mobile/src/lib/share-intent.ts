import { requireOptionalNativeModule } from 'expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { nativeCapabilities } from './native-capabilities';
import { listenForShareUrls, takeShareUrl } from './share-inbox';
import { useLatest } from './live-value';
import { isReadableShareUrl, parseSharedItem, SHARE_KEY, sharedItemRoute, type SharedItem } from './share-intent-parse';

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
// The account the hand-off was made for; another account never sees it.
let heldOwner: string | null = null;

/** The shared item of this kind the sheet was opened for, if any; `forgetShared` once it is in the form. */
export function sharedItem<K extends SharedItem['kind']>(kind: K): Extract<SharedItem, { kind: K }> | null {
  return held?.kind === kind ? (held as Extract<SharedItem, { kind: K }>) : null;
}

export function forgetShared(): void {
  held = null;
  heldOwner = null;
}

/**
 * Opens what was shared. Call it in the root layout's Root component with its
 * `ready`, like useQuickActions: the item waits until the stack is mounted and
 * someone is signed in, because the sheets it opens add to the Current Debate.
 * An item belongs to the account signed in when it was read: if that account
 * signs out first, it is dropped, never opened for the next one. An item read
 * before any session exists goes to whoever signs in on this phone.
 */
export function useShareIntent(ready: boolean): void {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const user = useLatest(userId);
  const [item, setItem] = useState<{ item: SharedItem; owner: string | null } | null>(null);

  useEffect(() => {
    if (!nativeCapabilities().shareIntent) return;
    const native = requireOptionalNativeModule<ShareIntentModule>('ExpoShareIntentModule');
    if (!native) return;
    // Reads run one at a time, so the item an event brings back is the last read's: it belongs to the
    // account that read started under, which stays set until the next read starts.
    let readOwner: string | null = null;
    let reading: Promise<void> = Promise.resolve();
    const changed = native.addListener('onChange', (event) => {
      const next = parseSharedItem(event.value);
      const owner = readOwner;
      // Read once: the item does not open again on the next launch.
      try {
        native.clearShareIntent(SHARE_KEY);
      } catch {
        // Nothing to clear.
      }
      if (next) setItem({ item: next, owner });
    });
    const failed = native.addListener('onError', (event) => {
      console.warn('Could not read what was shared:', typeof event.value === 'string' ? event.value : 'unknown error');
    });
    // A URL from a cold start waited in the inbox until now.
    const stopListening = listenForShareUrls((url) => {
      takeShareUrl();
      if (!isReadableShareUrl(url)) return;
      reading = reading.then(() => {
        readOwner = user.current;
        return native.getShareIntent(url);
      }).catch((cause: unknown) => console.warn('Could not read what was shared:', cause instanceof Error ? cause.message : cause));
    });
    return () => {
      stopListening();
      changed.remove();
      failed.remove();
    };
  }, [user]);

  // Another account: what the previous one shared is dropped, waiting or handed off.
  useEffect(() => {
    setItem((pending) => (pending && pending.owner !== null && pending.owner !== userId ? null : pending));
    if (heldOwner !== userId) forgetShared();
  }, [userId]);

  useEffect(() => {
    if (!item || !ready || !userId) return;
    if (item.owner !== null && item.owner !== userId) return;
    // After the stack has committed its first screens, as useQuickActions does.
    const timer = setTimeout(() => {
      setItem(null);
      held = item.item;
      heldOwner = userId;
      router.push(sharedItemRoute(item.item));
    }, 0);
    return () => clearTimeout(timer);
  }, [item, ready, userId, router]);
}
