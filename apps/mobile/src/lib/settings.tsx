import { isAppLanguage, type AppLanguage } from '@debatelab/core/languages';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from './auth';
import i18n, { deviceLanguage } from './i18n';
import { supabase } from './supabase';

import { applyColorScheme } from '@/theme/apply-color-scheme';

export type ThemePreference = 'light' | 'dark' | 'system';

type Settings = { language: AppLanguage; outputLanguage: AppLanguage; theme: ThemePreference };

type SettingsContextValue = Settings & {
  /**
   * False until the settings to open with are known: the signed-in account's
   * last known values from the device, or the device defaults. It never turns
   * false again, because the root navigator must not unmount on sign-in.
   */
  ready: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setOutputLanguage: (language: AppLanguage) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
};

// The columns each setting is stored in, in the website's user_settings row.
const COLUMNS = { language: 'language', outputLanguage: 'output_language', theme: 'theme' } as const;

const SIGNED_OUT: Settings = { language: deviceLanguage(), outputLanguage: 'en', theme: 'system' };

const SettingsContext = createContext<SettingsContextValue>({
  ...SIGNED_OUT,
  ready: true,
  setLanguage: async () => {},
  setOutputLanguage: async () => {},
  setTheme: async () => {},
});

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function parseSettings(value: unknown): Settings | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    language: isAppLanguage(record.language) ? record.language : 'en',
    outputLanguage: isAppLanguage(record.outputLanguage ?? record.output_language)
      ? (record.outputLanguage ?? record.output_language) as AppLanguage
      : 'en',
    theme: isThemePreference(record.theme) ? record.theme : 'system',
  };
}

const cacheKey = (userId: string) => `debatelab.settings.${userId}`;

/**
 * Interface language, AI output language and theme from the account's
 * user_settings row, shared with the website. The last known values are kept
 * on the device so the app opens in the right language and theme.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const [settings, setSettings] = useState<Settings>(SIGNED_OUT);
  const [ready, setReady] = useState(false);
  const owner = useRef(userId);

  const apply = useCallback((next: Settings, forUser: string | null) => {
    if (owner.current !== forUser) return;
    setSettings(next);
    if (i18n.language !== next.language) void i18n.changeLanguage(next.language);
    applyColorScheme(next.theme);
    if (forUser) {
      AsyncStorage.setItem(cacheKey(forUser), JSON.stringify(next)).catch((cause: unknown) =>
        console.warn('Could not keep settings on this device:', cause),
      );
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    owner.current = userId;
    if (!userId) {
      apply({ ...SIGNED_OUT, language: deviceLanguage() }, null);
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const cached = parseSettings(JSON.parse((await AsyncStorage.getItem(cacheKey(userId))) ?? 'null'));
        if (!cancelled && cached) apply(cached, userId);
      } catch (cause) {
        console.warn('Could not read settings from this device:', cause);
      }
      if (!cancelled) setReady(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('language,output_language,theme')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('Could not load settings:', error.message);
        return;
      }
      const server = parseSettings(data);
      if (server) apply(server, userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, apply]);

  const save = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!userId) return;
    const previous = settings;
    apply({ ...settings, [key]: value }, userId);
    // The sign-up trigger provisions the row and clients may only update it,
    // as in the website's settings store. Only the changed column is written.
    const { error } = await supabase
      .from('user_settings')
      .update({ [COLUMNS[key]]: value, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) {
      apply(previous, userId);
      throw new Error(error.message);
    }
  }, [userId, settings, apply]);

  const value = useMemo<SettingsContextValue>(() => ({
    ...settings,
    ready,
    setLanguage: (language) => save('language', language),
    setOutputLanguage: (language) => save('outputLanguage', language),
    setTheme: (theme) => save('theme', theme),
  }), [settings, ready, save]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
