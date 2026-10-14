import { DEFAULT_MODEL } from '../contract/model-catalog';
import { PROVIDER_ID, type ProviderConfig } from './providers/types';

export type FeatureTab = 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring';

const defaultConfig: ProviderConfig = {
  provider: PROVIDER_ID,
  model: DEFAULT_MODEL,
  temperature: 0.7,
  reasoningEffort: 'low',
};

/**
 * The model settings each tool starts with. The website saves these in
 * user_settings.feature_configs, and the app writes them too when it saves the
 * first setting, because the website reads an empty feature_configs as "never
 * saved". Both pass DEFAULT_PRO_MODEL when the plan (supabase/entitlement.ts)
 * includes Pro models.
 */
export const getDefaultFeatureConfigs = (model: string = DEFAULT_MODEL): Record<FeatureTab, ProviderConfig> => ({
  generate: { ...defaultConfig, model },
  attack: { ...defaultConfig, model },
  brainstorm: { ...defaultConfig, model, temperature: 0.9 },
  factoids: { ...defaultConfig, model, temperature: 0.3 },
  ask: { ...defaultConfig, model },
  sparring: { ...defaultConfig, model },
});
