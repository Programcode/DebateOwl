import { getDefaultFeatureConfigs } from '@debatelab/core/ai/feature-configs';
import { isAppLanguage, type AppLanguage } from '@debatelab/core/languages';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from './auth';
import i18n, { deviceLanguage } from './i18n';
import { supabase } from './supabase';

import { applyColorScheme } from '@/theme/apply-color-scheme';

export type ThemePreference = 'light' | 'dark' | 'system';

type Settings = { language: AppLanguage; outputLanguage: AppLanguage; theme: ThemePreference };
type SettingKey = keyof Settings;

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
const KEYS = Object.keys(COLUMNS) as SettingKey[];

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

function isEmptyObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

/**
 * The sign-up trigger provisions the row and clients may only update it, as in
 * the website's settings store. Only the changed column is written, plus the
 * website's default feature_configs while the row has none: the website reads
 * an empty feature_configs as "never saved" and would replace this setting
 * with the browser's. The filter keeps configs saved in the meantime.
 */
async function writeSetting(userId: string, key: SettingKey, value: string, configsMayBeEmpty: boolean) {
  const changes = { [COLUMNS[key]]: value, updated_at: new Date().toISOString() };
  if (configsMayBeEmpty) {
    const { data, error } = await supabase
      .from('user_settings')
      .update({ ...changes, feature_configs: getDefaultFeatureConfigs() })
      .eq('user_id', userId)
      .containedBy('feature_configs', {})
      .select('user_id');
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return;
  }
  const { error } = await supabase.from('user_settings').update(changes).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

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
  // The settings last applied, so a save builds on every earlier save.
  const latest = useRef(settings);
  // Bumped by every save of a key. A load keeps the local value of any key
  // saved after it started, and a failed save undoes its key only while it is
  // still the latest save of that key.
  const versions = useRef<Record<SettingKey, number>>({ language: 0, outputLanguage: 0, theme: 0 });
  // Whether the row's feature_configs is filled in; null until a load or save tells.
  const configsSaved = useRef<boolean | null>(null);

  const apply = useCallback((next: Settings, forUser: string | null) => {
    if (owner.current !== forUser) return;
    latest.current = next;
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
    configsSaved.current = null;
    if (!userId) {
      apply({ ...SIGNED_OUT, language: deviceLanguage() }, null);
      setReady(true);
      return;
    }
    let cancelled = false;
    const started = { ...versions.current };
    // Loaded values, except for keys saved since the load started.
    const merge = (loaded: Settings): Settings => {
      const next = { ...latest.current };
      for (const key of KEYS) {
        if (versions.current[key] === started[key]) Object.assign(next, { [key]: loaded[key] });
      }
      return next;
    };
    void (async () => {
      try {
        const cached = parseSettings(JSON.parse((await AsyncStorage.getItem(cacheKey(userId))) ?? 'null'));
        if (!cancelled && cached) apply(merge(cached), userId);
      } catch (cause) {
        console.warn('Could not read settings from this device:', cause);
      }
      if (!cancelled) setReady(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('language,output_language,theme,feature_configs')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('Could not load settings:', error.message);
        return;
      }
      if (data && configsSaved.current === null) configsSaved.current = !isEmptyObject(data.feature_configs);
      const server = parseSettings(data);
      if (server) apply(merge(server), userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, apply]);

  const save = useCallback(async <K extends SettingKey>(key: K, value: Settings[K]) => {
    const forUser = owner.current;
    if (!forUser) return;
    const version = ++versions.current[key];
    const previous = latest.current[key];
    apply({ ...latest.current, [key]: value }, forUser);
    try {
      await writeSetting(forUser, key, value, configsSaved.current !== true);
      if (owner.current === forUser) configsSaved.current = true;
    } catch (cause) {
      if (owner.current === forUser && versions.current[key] === version) {
        apply({ ...latest.current, [key]: previous }, forUser);
      }
      throw cause;
    }
  }, [apply]);

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
