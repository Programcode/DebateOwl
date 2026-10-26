import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { localizedPath, RouteLanguageProvider, type LocalizedRoute as EnglishRoute } from '@/lib/seo/localized-routes';

interface LocalizedRouteProps {
  /** The English page this address translates. */
  route: EnglishRoute;
  language: 'hu' | 'es';
  children: ReactNode;
}

/**
 * A Hungarian or Spanish address (/hu, /es/tools/…). Opening it chooses its
 * language like a ?lang= link, so Start leads into the app in that language;
 * mountApp already did that on a full page load. Picking another language
 * with the switcher afterwards moves to that language's address, so the
 * page and its URL never disagree.
 */
export function LocalizedRoute({ route, language, children }: LocalizedRouteProps) {
  const chosen = useSettingsStore((state) => state.language);
  const navigate = useNavigate();
  // The language this address last showed; React keeps this component between /hu and /es.
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (useSettingsStore.getState().language !== language) useSettingsStore.getState().chooseLinkedLanguage(language);
  }, [language]);

  useEffect(() => {
    if (chosen === language) {
      shown.current = language;
    } else if (shown.current === language) {
      // Only a change after the page showed its own language: arriving from another page passes through here first.
      navigate(localizedPath(route, chosen), { replace: true });
    }
  }, [chosen, language, navigate, route]);

  return <RouteLanguageProvider value={language}>{children}</RouteLanguageProvider>;
}
