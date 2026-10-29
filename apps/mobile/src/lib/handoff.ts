import { requireOptionalNativeModule } from 'expo';
import { usePathname, useRouter, type Href } from 'expo-router';
import i18n from 'i18next';
import { useEffect, useState } from 'react';

import { continuedRoute, handoffTarget, WEBSITE_ORIGIN } from './app-intent-links';
import { useAuth } from './auth';
import { nativeCapabilities } from './native-capabilities';

/**
 * Handoff through the app's own module, modules/handoff (NSUserActivity). The
 * open screen is offered to the student's other devices: a Mac continues on its
 * debateowl.com page (app-intent-links.ts), an iPad with DebateOwl opens the same
 * route. The module is in development builds only; Expo Go and a build without
 * it do nothing. The web preview has handoff.web.ts.
 */

/** Also in modules/handoff/ios/HandoffModule.swift and Info.plist's NSUserActivityTypes. */
const ACTIVITY_TYPE = 'com.pistack.debateowl.browsing';

type HandoffModule = {
  setActivity: (activity: { type: string; title: string; webpageURL: string; appPath: string }) => void;
  clearActivity: () => void;
  takeContinuedPath: () => string | null;
  addListener: (event: 'onContinue', listener: () => void) => { remove: () => void };
};

let cached: HandoffModule | null | undefined;

function handoffModule(): HandoffModule | null {
  if (cached === undefined) {
    cached = nativeCapabilities().handoff ? requireOptionalNativeModule<HandoffModule>('DebateOwlHandoff') : null;
  }
  return cached;
}

/**
 * Offers `pathname` (an Expo Router pathname) to the student's other devices,
 * or withdraws the offer when it is null or has no website page (sign-in).
 */
export function syncHandoff(pathname: string | null): void {
  const native = handoffModule();
  if (!native) return;
  const target = pathname ? handoffTarget(pathname) : null;
  try {
    if (!pathname || !target) {
      native.clearActivity();
      return;
    }
    native.setActivity({
      type: ACTIVITY_TYPE,
      title: i18n.t(target.titleKey),
      webpageURL: `${WEBSITE_ORIGIN}${target.webPath}`,
      appPath: pathname,
    });
  } catch (cause) {
    console.warn('Could not update Handoff:', cause instanceof Error ? cause.message : cause);
  }
}

/**
 * Keeps Handoff on the screen shown, and opens a screen another device handed
 * over. Call it in the root layout's Root component, before its early return,
 * with that component's `ready`. A handed-over screen waits until then, and,
 * except a share link, until someone is signed in.
 */
export function useHandoff(ready: boolean): void {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const signedIn = session !== null;
  const [language, setLanguage] = useState(i18n.language);
  const [pending, setPending] = useState<string | null>(null);

  // The title follows the app's language.
  useEffect(() => {
    const onChange = (next: string) => setLanguage(next);
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, []);

  useEffect(() => {
    syncHandoff(ready ? pathname : null);
  }, [pathname, ready, language]);

  useEffect(() => {
    const native = handoffModule();
    if (!native) return;
    const take = () => {
      const route = continuedRoute(native.takeContinuedPath());
      if (route) setPending(route);
    };
    take();
    const subscription = native.addListener('onContinue', take);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pending || !ready || (!signedIn && !pending.startsWith('/share/'))) return;
    // After the stack has committed its first screens, as useQuickActions does.
    const timer = setTimeout(() => {
      setPending(null);
      router.navigate(pending as Href);
    }, 0);
    return () => clearTimeout(timer);
  }, [pending, ready, signedIn, router]);
}
