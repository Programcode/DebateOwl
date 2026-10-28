import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyAppLanguage } from '@/i18n';
import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import {
  featureConfigsAreCanonical,
  getDefaultFeatureConfigs,
  normalizeFeatureConfig,
  normalizeFeatureConfigs,
  type FeatureTab,
} from '@debatelab/core/ai/feature-configs';
import { readProModelAccess } from '@debatelab/core/supabase/billing';
import type { BillingSettingsRow } from '@debatelab/core/contract/billing-state';
import { DEFAULT_MODEL, DEFAULT_PRO_MODEL } from '../../../supabase/functions/_shared/model-catalog';
import type { ProviderConfig } from '../ai/providers/types';
import { supabase } from '@/lib/supabase/client';
import { restoredSessionsBlocked } from '@/lib/supabase/session-expiry';
import { currentUserId } from '@/lib/supabase/current-user';

export type { FeatureTab };
type CoreFeatureTab = Exclude<FeatureTab, 'sparring'>;
type FeatureConfigs = Record<CoreFeatureTab, ProviderConfig> & Partial<Record<'sparring', ProviderConfig>>;

interface SettingsState {
  /** Account these device settings belong to. Null until sign-in binds them. */
  ownerUserId: string | null;
  language: AppLanguage;
  outputLanguage: AppLanguage;
  theme: 'light' | 'dark' | 'system';
  customSystemPrompt?: string;
  featureConfigs: FeatureConfigs;
  wikiResearchEnabled: boolean;

  setLanguage: (lang: AppLanguage) => void;
  /** A ?lang= link's choice, which may arrive before the account's settings load. */
  chooseLinkedLanguage: (lang: AppLanguage) => void;
  setOutputLanguage: (lang: AppLanguage) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFeatureConfig: (feature: FeatureTab, config: Partial<ProviderConfig>) => void;
  getFeatureConfig: (feature: FeatureTab) => ProviderConfig;
  setSystemPrompt: (prompt: string) => void;
  setWikiResearchEnabled: (enabled: boolean) => void;
  hydrateFromServer: () => Promise<void>;
  resetLocalData: (preserveLanguage?: boolean) => void;
  /** Drops another account's prompt and model choices before the server copy loads. */
  prepareForUser: (userId: string) => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Whether this account may keep Pro-only model choices, by the same resolver
 * the AI functions use (billing-state.ts): a past-due payer in the grace, a
 * paid period behind a lagging tier, or App Store Pro keeps them. Null when it
 * cannot be read.
 */
async function canAccessProModels(userId: string, settings: Record<string, unknown>): Promise<boolean | null> {
  return readProModelAccess((table, columns) => supabase.from(table).select(columns).eq('user_id', userId), settings as BillingSettingsRow);
}

async function getUserId() {
  return await currentUserId();
}

// The auth trigger provisions every settings row, and clients may only UPDATE
// the user-editable columns. An upsert needs INSERT and is always denied.
type SettingsPayload = {
  language: string;
  output_language: string;
  theme: string;
  feature_configs: Record<string, ProviderConfig>;
  custom_system_prompt: string | null;
};

async function updateSettings(payload: SettingsPayload) {
  const userId = await getUserId();
  if (!userId) return;
  await updateSettingsFor(userId, payload);
}

async function updateSettingsFor(userId: string, payload: SettingsPayload) {
  const { error } = await supabase.from('user_settings').update({
    ...payload,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (error) {
    console.warn('[SettingsStore] Failed to persist settings:', error.message);
  }
}

// Bumped by every reset and every hydration. A hydration that started for an
// earlier account, or was overtaken by a newer one, applies and saves nothing.
let hydrationGeneration = 0;

/** A ?lang= link's language, until the account's settings load and take it. */
let linkedLanguage: AppLanguage | null = null;

/** Saves only the interface language, so it can never overwrite settings this device has not loaded. */
async function updateLanguage(language: AppLanguage) {
  const userId = await getUserId();
  if (!userId) return;
  const { error } = await supabase.from('user_settings').update({
    language,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (error) {
    console.warn('[SettingsStore] Failed to persist the language:', error.message);
  }
}

// The cleanup rewrites the whole feature_configs snapshot it read, so it only
// applies while the row is unchanged since that read. A settings save that
// lands first moves updated_at and wins; the next hydration retries.
async function persistMigratedFeatureConfigs(
  userId: string,
  featureConfigs: Record<FeatureTab, ProviderConfig>,
  readUpdatedAt: string | null,
) {
  const update = supabase
    .from('user_settings')
    .update({ feature_configs: featureConfigs, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  const { error } = await (readUpdatedAt === null
    ? update.is('updated_at', null)
    : update.eq('updated_at', readUpdatedAt));
  if (error) {
    console.warn('[SettingsStore] Failed to persist migrated settings:', error.message);
  }
}

/**
 * A rehydrate that finishes after sign-in must not restore another account's
 * prompt or model choices. Settings saved before an owner was recorded stay
 * only until this account is bound.
 */
export function mergePersistedSettingsState(persistedState: unknown, currentState: SettingsState): SettingsState {
  const saved = persistedState && typeof persistedState === 'object' ? persistedState as Partial<SettingsState> : {};
  const savedOwner = typeof saved.ownerUserId === 'string' ? saved.ownerUserId : null;
  if (currentState.ownerUserId && savedOwner !== currentState.ownerUserId) return currentState;
  return { ...currentState, ...saved, ownerUserId: savedOwner ?? currentState.ownerUserId };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ownerUserId: null as string | null,
      language: 'en',
      outputLanguage: 'en',
      // Light by default; System and Dark are a choice in Settings or the header toggle.
      theme: 'light',
      customSystemPrompt: undefined as string | undefined,
      featureConfigs: getDefaultFeatureConfigs(),
      wikiResearchEnabled: false,

      setLanguage: (language) => {
        // A choice made here beats an earlier ?lang= link.
        linkedLanguage = null;
        set({ language });
        void applyAppLanguage(language);
        // Only the language: the switcher shows on pages that open before the
        // account's settings load, and this device's copy of the rest may be older.
        void updateLanguage(language);
      },
      chooseLinkedLanguage: (language) => {
        // Kept until the account's settings load, so their saved language does not undo it.
        linkedLanguage = language;
        set({ language });
        void applyAppLanguage(language);
        void updateLanguage(language);
      },
      setOutputLanguage: (outputLanguage) => {
        set({ outputLanguage });
        void updateSettings({
          language: get().language,
          output_language: outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setTheme: (theme) => {
        set({ theme });
        void updateSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },
      setSystemPrompt: (prompt) => {
        set({ customSystemPrompt: prompt });
        void updateSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: prompt || null,
        });
      },
      setWikiResearchEnabled: (enabled) => {
        set({ wikiResearchEnabled: enabled });
      },

      setFeatureConfig: (feature, config) => {
        set((state) => ({
          featureConfigs: {
            ...state.featureConfigs,
            [feature]: normalizeFeatureConfig(
              { ...state.featureConfigs[feature], ...config },
              getDefaultFeatureConfigs()[feature],
            ),
          },
        }));
        void updateSettings({
          language: get().language,
          output_language: get().outputLanguage,
          theme: get().theme,
          feature_configs: get().featureConfigs,
          custom_system_prompt: get().customSystemPrompt ?? null,
        });
      },

      getFeatureConfig: (feature) => {
        const config = get().featureConfigs[feature];
        if (config) return config;
        const defaults = getDefaultFeatureConfigs();
        return defaults[feature];
      },

      hydrateFromServer: async () => {
        if (restoredSessionsBlocked()) return;
        // The account is read once, at the start; every later step checks the
        // generation, so an account switch during an await drops this run.
        const generation = ++hydrationGeneration;
        const current = () => generation === hydrationGeneration;
        const userId = await getUserId();
        if (!userId || !current()) return;
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .single();
        if (error || !data || !current()) return;

        const allowProModels = await canAccessProModels(userId, data);
        if (allowProModels === null || !current()) return;
        const mergedConfigs = normalizeFeatureConfigs(
          data.feature_configs,
          allowProModels,
          allowProModels ? DEFAULT_PRO_MODEL : DEFAULT_MODEL,
        );
        const configsNeedMigration = !featureConfigsAreCanonical(data.feature_configs, mergedConfigs);
        // The sign-up trigger provisions the row with defaults and only this client
        // fills in feature_configs, so an empty object means it was never saved.
        // Keep what the student already chose instead of the defaults.
        const savedConfigs = asRecord(data.feature_configs);
        const neverSaved = savedConfigs !== null && Object.keys(savedConfigs).length === 0;

        // A ?lang= link opened this page: it wins over the language the account saved before.
        const linked = linkedLanguage;
        linkedLanguage = null;
        const language = linked ?? (neverSaved ? get().language : isAppLanguage(data.language) ? data.language : 'en');
        const outputLanguage = neverSaved ? get().outputLanguage : isAppLanguage(data.output_language) ? data.output_language : 'en';
        const theme = neverSaved ? get().theme : (data.theme as 'light' | 'dark' | 'system') || 'light';
        const customSystemPrompt = data.custom_system_prompt || undefined;
        await applyAppLanguage(language);
        if (!current()) return;
        set({
          language,
          outputLanguage,
          theme,
          featureConfigs: mergedConfigs,
          customSystemPrompt,
          wikiResearchEnabled: get().wikiResearchEnabled,
        });
        if (neverSaved) {
          await updateSettingsFor(userId, {
            language,
            output_language: outputLanguage,
            theme,
            feature_configs: mergedConfigs,
            custom_system_prompt: customSystemPrompt ?? null,
          });
        } else if (configsNeedMigration && get().featureConfigs === mergedConfigs) {
          await persistMigratedFeatureConfigs(
            userId,
            mergedConfigs,
            typeof data.updated_at === 'string' ? data.updated_at : null,
          );
        }
        // The link was opened signed out, or its own save has not landed yet,
        // unless the switcher has replaced its language since.
        if (linked && !neverSaved && linked !== data.language && get().language === linked) await updateLanguage(linked);
      },
      resetLocalData: (preserveLanguage = false) => {
        hydrationGeneration += 1;
        const language = preserveLanguage ? get().language : 'en';
        // A sign-out or another account: an earlier ?lang= link no longer applies.
        if (!preserveLanguage) linkedLanguage = null;
        set({
          ownerUserId: null,
          language,
          outputLanguage: 'en',
          theme: 'light',
          customSystemPrompt: undefined,
          featureConfigs: getDefaultFeatureConfigs(),
          wikiResearchEnabled: false,
        });
        void applyAppLanguage(language);
      },
      prepareForUser: (userId) => {
        if (get().ownerUserId === userId) return;
        set({
          ownerUserId: userId,
          customSystemPrompt: undefined,
          featureConfigs: getDefaultFeatureConfigs(),
          wikiResearchEnabled: false,
        });
      },
    }),
    {
      name: 'debate-trainer-settings',
      version: 2,
      merge: mergePersistedSettingsState,
      migrate: (persistedState: unknown, version) => {
        const saved = asRecord(persistedState);
        if (!saved) return persistedState;
        const featureConfigs = normalizeFeatureConfigs(saved.featureConfigs);
        if (version < 2) {
          for (const config of Object.values(featureConfigs)) {
            if (config.model === 'z-ai/glm-5.3-flash') config.model = DEFAULT_MODEL;
          }
        }
        return {
          ...saved,
          language: isAppLanguage(saved.language) ? saved.language : 'en',
          outputLanguage: isAppLanguage(saved.outputLanguage) ? saved.outputLanguage : 'en',
          featureConfigs,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.featureConfigs = normalizeFeatureConfigs(state.featureConfigs);
        if (!isAppLanguage(state.language)) state.language = 'en';
        if (!isAppLanguage(state.outputLanguage)) state.outputLanguage = 'en';
        if (!state.theme) state.theme = 'light';
        if (typeof state.wikiResearchEnabled !== 'boolean') state.wikiResearchEnabled = false;
        void applyAppLanguage(state.language);
      },
    }
  )
);
