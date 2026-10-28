import { requireOptionalNativeModule } from 'expo';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { nativeCapabilities } from './native-capabilities';

/**
 * Home Screen quick actions (a long press on the app icon). The items are
 * static, declared in Info.plist by native-config/round4.ts with titles in the
 * device language; expo-quick-actions hands the one the student picked to the
 * app, at launch or while it runs. Each item's type is looked up here, never
 * taken as a route. Expo Go and a build without expo-quick-actions have no
 * module, so the hook does nothing there.
 */
export const QUICK_ACTION_ROUTES = {
  'new-debate': '/new-debate',
  timer: '/timer',
  ask: '/ask',
} as const satisfies Record<string, Href>;

export type QuickActionType = keyof typeof QUICK_ACTION_ROUTES;

// expo-quick-actions sends the item's type as `id`.
type QuickAction = { id?: string | null };
type QuickActionsModule = {
  initial?: QuickAction | null;
  addListener?: (event: 'onQuickAction', listener: (action: QuickAction) => void) => { remove: () => void };
};

let initialHandled = false;

function routeFor(action: QuickAction | null | undefined): Href | null {
  const id = action?.id;
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(QUICK_ACTION_ROUTES, id)) return null;
  return QUICK_ACTION_ROUTES[id as QuickActionType];
}

/**
 * Opens the screen of the quick action the app was launched or resumed with.
 * Call it in the root layout's Root component, before its early return, with
 * that component's `ready` (fonts, auth and settings loaded, so the stack is
 * mounted). A picked action waits until then, and until someone is signed
 * in: the stack only has these routes behind sign-in.
 */
export function useQuickActions(ready: boolean): void {
  const router = useRouter();
  const { session } = useAuth();
  const [pending, setPending] = useState<Href | null>(null);

  useEffect(() => {
    if (!nativeCapabilities().quickActions) return;
    const native = requireOptionalNativeModule<QuickActionsModule>('ExpoQuickActions');
    if (!native) return;
    if (!initialHandled) {
      initialHandled = true;
      const route = routeFor(native.initial);
      if (route) setPending(route);
    }
    const subscription = native.addListener?.('onQuickAction', (action) => {
      const route = routeFor(action);
      if (route) setPending(route);
    });
    return () => subscription?.remove();
  }, []);

  const signedIn = session !== null;
  useEffect(() => {
    if (!pending || !ready || !signedIn) return;
    // After the stack has committed its first screens, as expo-quick-actions' own router hook does.
    const timer = setTimeout(() => {
      setPending(null);
      router.navigate(pending);
    }, 0);
    return () => clearTimeout(timer);
  }, [pending, ready, signedIn, router]);
}
