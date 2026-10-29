import { getDefaultFeatureConfigs, type FeatureTab } from '@debatelab/core/ai/feature-configs';
import { readProModelAccess } from '@debatelab/core/supabase/billing';
import { DEFAULT_MODEL, DEFAULT_PRO_MODEL } from '@debatelab/core/contract/model-catalog';
import { isAppLanguage, type AppLanguage } from '@debatelab/core/languages';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { runRequest } from './run-request';
import { useAuth } from './auth';
import {
  canUseProModels,
  featureConfigsWith,
  fetchFeatureConfig,
  fetchFeatureSettings,
  type FeatureConfig,
  type FeatureConfigChange,
} from './feature-config';
import { readFeatureConfigAfterWrites } from './feature-config-read';
import i18n, { deviceLanguage, changeAppLanguage } from './i18n';
import { keepSettingsCopy, preloadSettingsCopy, readSettingsCopy } from './settings-cache';
import { createSerialQueue } from './serial-queue';
import { billingQuery } from './billing-query';
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
  /** Saves one tool's model or reasoning to feature_configs, in order with every other settings write. */
  setFeatureConfig: (feature: FeatureTab, change: FeatureConfigChange) => Promise<void>;
  /** A tool's config, read after every settings write made before it, so a tool runs with the model just picked. */
  readFeatureConfig: (userId: string, feature: FeatureTab) => Promise<FeatureConfig>;
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
  setFeatureConfig: async () => {},
  readFeatureConfig: fetchFeatureConfig,
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

/** How long a tool waits for earlier settings writes before reading its model anyway, with the choice still being saved on top. */
const READ_WAIT_MS = 5000;

function isEmptyObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

/**
 * The starting model the website would pick for this student, or null when
 * their Pro access can't be read right now.
 */
async function defaultModelFor(userId: string): Promise<string | null> {
  const pro = await readProModelAccess(billingQuery(userId));
  if (pro === null) return null;
  return pro ? DEFAULT_PRO_MODEL : DEFAULT_MODEL;
}

/**
 * The sign-up trigger provisions the row and clients may only update it, as in
 * the website's settings store. Only the changed column is written, plus the
 * website's default feature_configs while the row has none: the website reads
 * an empty feature_configs as "never saved" and would replace this setting
 * with the browser's. The defaults use the Pro model when the student has Pro
 * access, as the website's would, because the website never upgrades configs
 * once they are saved. The filter keeps configs saved in the meantime; when it
 * matches nothing, configs were filled elsewhere and only the column is written.
 *
 * When configs may be empty and Pro access can't be read, nothing is written
 * and the save fails: a column saved alone would be replaced by the website.
 * Once this resolves, the row's feature_configs is filled in.
 */
async function writeSetting(userId: string, key: SettingKey, value: string, configsMayBeEmpty: boolean) {
  const changes = { [COLUMNS[key]]: value, updated_at: new Date().toISOString() };
  if (configsMayBeEmpty) {
    const model = await defaultModelFor(userId);
    if (!model) throw new Error('Could not read Pro access to fill in the default feature configs');
    const { data, error } = await supabase
      .from('user_settings')
      .update({ ...changes, feature_configs: getDefaultFeatureConfigs(model) })
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
 * Writes one tool's change into the row's feature_configs, as the website's
 * setFeatureConfig saves the whole object: every tool's config read fresh and
 * normalised, the website's defaults filled in where none was saved (so an
 * empty feature_configs is filled here too), and the change applied. A Pro
 * model is refused without Pro access, and nothing is written when Pro access
 * can't be read.
 */
async function writeFeatureConfig(userId: string, feature: FeatureTab, change: FeatureConfigChange) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('feature_configs')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No settings row for this account');
  const pro = await canUseProModels(userId);
  if (pro === null) throw new Error('Could not read Pro access');
  const featureConfigs = featureConfigsWith(data.feature_configs, pro, feature, change);
  const { error: writeError } = await supabase
    .from('user_settings')
    .update({ feature_configs: featureConfigs, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (writeError) throw new Error(writeError.message);
}

/**
 * Interface language, AI output language and theme from the account's
 * user_settings row, shared with the website. The last known values are kept
 * on the device so the app opens in the right language and theme.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const [initialCopy] = useState(preloadSettingsCopy);
  const startupCopy = useRef<typeof initialCopy | null>(initialCopy);
  const [snapshot, setSnapshot] = useState<{ owner: string | null; value: Settings }>({ owner: null, value: SIGNED_OUT });
  const settings = snapshot.owner === userId ? snapshot.value : SIGNED_OUT;
  const [ready, setReady] = useState(false);
  const owner = useRef(userId);
  // Bumped on every owner change, including signing out and back in as the
  // same account. Async work from an earlier generation never lands, even when
  // the same account is signed in again.
  const generation = useRef(0);
  // The settings last applied, so a save builds on every earlier save.
  const latest = useRef(settings);
  // Per key, the value the account's row last held as far as the app knows:
  // from a load, or from a save that succeeded. A failed save rolls back to it.
  const confirmed = useRef<Settings>({ ...SIGNED_OUT });
  // Bumped by every save of a key. A load keeps the local value of any key
  // saved after it started, and a failed save rolls its key back only while it
  // is still the latest save of that key.
  const versions = useRef<Record<SettingKey, number>>({ language: 0, outputLanguage: 0, theme: 0 });
  // Whether the row's feature_configs is filled in; null until a load or save tells.
  const configsSaved = useRef<boolean | null>(null);
  // Per tool and field, the model or reasoning still being saved, so a tool
  // that stops waiting for a slow save still runs with it. Each entry is
  // dropped when its save settles, unless a later save of that field replaced it.
  const pendingConfigs = useRef(new Map<string, { feature: FeatureTab; change: FeatureConfigChange; seq: number }>());
  const pendingSeq = useRef(0);
  // Saves write one at a time in the order they were made, so the last choice
  // is the last write even when an earlier save's Pro-access check is slower.
  const [writes] = useState(createSerialQueue);

  const apply = useCallback((next: Settings, forUser: string | null, gen: number) => {
    if (generation.current !== gen) return;
    latest.current = next;
    setSnapshot({ owner: forUser, value: next });
    if (i18n.language !== next.language) void changeAppLanguage(next.language);
    applyColorScheme(next.theme);
    if (forUser) {
      keepSettingsCopy(forUser, JSON.stringify(next)).catch((cause: unknown) =>
        console.warn('Could not keep settings on this device:', cause),
      );
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    const preloaded = startupCopy.current;
    startupCopy.current = null;
    owner.current = userId;
    const gen = ++generation.current;
    configsSaved.current = null;
    pendingConfigs.current.clear();
    if (!userId) {
      apply({ ...SIGNED_OUT, language: deviceLanguage() }, null, gen);
      confirmed.current = { ...latest.current };
      setReady(true);
      return;
    }
    apply({ ...SIGNED_OUT, language: deviceLanguage() }, null, gen);
    confirmed.current = { ...latest.current };
    let cancelled = false;
    const started = { ...versions.current };
    // Loaded values, except for keys saved since the load started. The values
    // taken also become the confirmed ones.
    const merge = (loaded: Settings): Settings => {
      const next = { ...latest.current };
      for (const key of KEYS) {
        if (versions.current[key] !== started[key]) continue;
        Object.assign(next, { [key]: loaded[key] });
        Object.assign(confirmed.current, { [key]: loaded[key] });
      }
      return next;
    };
    void (async () => {
      await runRequest(async () => {
        const cached = parseSettings(JSON.parse((await readSettingsCopy(userId, preloaded)) ?? 'null'));
        if (!cancelled && cached) apply(merge(cached), userId, gen);
      }, async (cause) => {
        console.warn('Could not read settings from this device:', cause);
      });
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
      if (server) apply(merge(server), userId, gen);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, apply, initialCopy]);

  const save = useCallback(async <K extends SettingKey>(key: K, value: Settings[K]) => {
    const forUser = owner.current;
    if (!forUser) return;
    const gen = generation.current;
    const version = ++versions.current[key];
    apply({ ...latest.current, [key]: value }, forUser, gen);
    return await runRequest(async () => {
      await writes(async () => {
        // A save made before an owner change is dropped, not written after it,
        // even when the same account has signed in again since.
        if (generation.current !== gen) return;
        await writeSetting(forUser, key, value, configsSaved.current !== true);
        if (generation.current !== gen) return;
        configsSaved.current = true;
        Object.assign(confirmed.current, { [key]: value });
      });
    }, async (cause) => {
      if (generation.current !== gen) return;
      if (versions.current[key] === version) apply({ ...latest.current, [key]: confirmed.current[key] }, forUser, gen);
      throw cause;
    });
  }, [apply, writes]);

  // The picker shows its own optimistic value and rolls it back on failure (model-picker.tsx).
  const setFeatureConfig = useCallback(async (feature: FeatureTab, change: FeatureConfigChange) => {
    const forUser = owner.current;
    if (!forUser) throw new Error('Sign in to choose a model');
    const gen = generation.current;
    const seq = ++pendingSeq.current;
    const fields = (Object.keys(change) as (keyof FeatureConfigChange)[]).filter((field) => change[field] !== undefined);
    const keys = fields.map((field) => {
      const key = `${feature}.${field}`;
      pendingConfigs.current.set(key, { feature, change: { [field]: change[field] }, seq });
      return key;
    });
    return await runRequest(async () => {
      await writes(async () => {
        if (generation.current !== gen) return;
        await writeFeatureConfig(forUser, feature, change);
        if (generation.current !== gen) return;
        configsSaved.current = true;
      });
    }, undefined, () => {
      if (generation.current === gen) {
        for (const key of keys) if (pendingConfigs.current.get(key)?.seq === seq) pendingConfigs.current.delete(key);
      }
    });
  }, [writes]);

  const readFeatureConfig = useCallback((forUser: string, feature: FeatureTab) => {
    const gen = generation.current;
    return readFeatureConfigAfterWrites({
      writes,
      read: () => fetchFeatureSettings(forUser, feature),
      // Only this account's choices, and none from before an owner change.
      pending: () => {
        if (generation.current !== gen || owner.current !== forUser) return null;
        const entries = [...pendingConfigs.current.values()].filter((entry) => entry.feature === feature);
        return entries.length ? Object.assign({}, ...entries.map((entry) => entry.change)) as FeatureConfigChange : null;
      },
      waitMs: READ_WAIT_MS,
    });
  }, [writes]);

  const value = useMemo<SettingsContextValue>(() => ({
    ...settings,
    ready,
    setLanguage: (language) => save('language', language),
    setOutputLanguage: (language) => save('outputLanguage', language),
    setTheme: (theme) => save('theme', theme),
    setFeatureConfig,
    readFeatureConfig,
  }), [settings, ready, save, setFeatureConfig, readFeatureConfig]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
