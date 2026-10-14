import type { FeatureTab } from '@debatelab/core/ai/feature-configs';
import {
  AUTO_FAST,
  AUTO_MODEL_SELECTIONS,
  MODEL_CATALOG,
  isAutoModelSelection,
  type ReasoningEffort,
} from '@debatelab/core/contract/model-catalog';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ActionMenu } from './action-menu';
import { Chip } from './chip';
import { FormGroup, SelectRow } from './form-rows';
import { Text } from './text';

import { useAuth } from '@/lib/auth';
import { fetchFeatureSettings, type FeatureConfig } from '@/lib/feature-config';
import { useSettings } from '@/lib/settings';
import { useTheme } from '@/theme/use-theme';

/** The website's ModelSelector list: the Auto choices, then the catalog. */
const MODELS = [...AUTO_MODEL_SELECTIONS, ...MODEL_CATALOG].map((model) => ({ id: model.id, name: model.name, pro: model.isProOnly }));
const EFFORTS: { value: ReasoningEffort; label: string }[] = [
  { value: 'low', label: 'modelSelector.reasoningLow' },
  { value: 'medium', label: 'modelSelector.reasoningMedium' },
  { value: 'high', label: 'modelSelector.reasoningHigh' },
];

type Choice = Pick<FeatureConfig, 'model' | 'reasoningEffort'>;
type Field = keyof Choice;

/**
 * One tool's model and reasoning, read from feature_configs and saved back
 * through the settings provider's queue. A change shows at once; a failed
 * save rolls back only its own field, and only while it is that field's
 * latest change. Nothing lands after an account change or after leaving.
 */
function useModelChoice(feature: FeatureTab, onChange?: () => void) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { setFeatureConfig } = useSettings();
  const [state, setState] = useState<{ owner: string; choice: Choice; pro: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const owner = useRef(userId);
  const live = useRef(true);
  const loads = useRef(0);
  const versions = useRef<Record<Field, number>>({ model: 0, reasoningEffort: 0 });
  // Per field, what the row last held as far as the app knows.
  const confirmed = useRef<Choice | null>(null);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    owner.current = userId;
    const request = ++loads.current;
    confirmed.current = null;
    setState(null);
    setFailed(false);
    if (!userId) return;
    const started = { ...versions.current };
    void fetchFeatureSettings(userId, feature).then(({ config, pro }) => {
      if (!live.current || loads.current !== request || owner.current !== userId) return;
      const loaded = { model: config.model, reasoningEffort: config.reasoningEffort };
      confirmed.current = loaded;
      // A field changed while this load ran keeps the change.
      setState((previous) => {
        const choice = { ...loaded };
        if (previous?.owner === userId) {
          if (versions.current.model !== started.model) choice.model = previous.choice.model;
          if (versions.current.reasoningEffort !== started.reasoningEffort) choice.reasoningEffort = previous.choice.reasoningEffort;
        }
        return { owner: userId, choice, pro };
      });
    });
  }, [userId, feature]);

  const change = (field: Field, value: string) => {
    const forUser = owner.current;
    if (!forUser || !state || state.owner !== forUser) return;
    const version = ++versions.current[field];
    const update = { [field]: value } as Partial<Choice>;
    setState((current) => (current && current.owner === forUser ? { ...current, choice: { ...current.choice, ...update } } : current));
    setFailed(false);
    onChange?.();
    setFeatureConfig(feature, update)
      .then(() => {
        if (!live.current || owner.current !== forUser) return;
        if (confirmed.current) confirmed.current = { ...confirmed.current, ...update };
      })
      .catch((cause: unknown) => {
        console.warn('Could not save the model:', cause instanceof Error ? cause.message : cause);
        if (!live.current || owner.current !== forUser) return;
        setFailed(true);
        if (versions.current[field] !== version || !confirmed.current) return;
        const previous = confirmed.current[field];
        setState((current) => (current && current.owner === forUser ? { ...current, choice: { ...current.choice, [field]: previous } } : current));
      });
  };

  return { state, failed, change };
}

function useOptions(pro: boolean) {
  const { t } = useTranslation();
  return {
    models: MODELS.map((model) => ({ value: model.id, label: model.pro ? `${model.name} · Pro` : model.name, disabled: model.pro && !pro })),
    efforts: EFFORTS.map((effort) => ({ value: effort.value, label: t(effort.label) })),
  };
}

/** The website's reasoning choice: Pro only, and not for Auto, which then shows Low. */
function reasoningFor(choice: Choice, pro: boolean) {
  const automatic = isAutoModelSelection(choice.model);
  return { value: !automatic && pro ? choice.reasoningEffort : 'low', disabled: !pro || automatic };
}

function autoDescription(t: ReturnType<typeof useTranslation>['t'], model: string): string | undefined {
  if (!isAutoModelSelection(model)) return undefined;
  return model === AUTO_FAST ? t('modelSelector.autoFastDescription') : t('modelSelector.autoProDescription');
}

/** The website's ModelSelector in a tool's form: the model and its reasoning, saved for that tool. */
export function ModelPicker({ feature }: { feature: FeatureTab }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, failed, change } = useModelChoice(feature);
  const { models, efforts } = useOptions(state?.pro ?? false);
  const loading = [{ value: '', label: t('common.loading') }];
  const reasoning = state ? reasoningFor(state.choice, state.pro) : null;
  return (
    <View style={styles.wrap}>
      <FormGroup label={t('modelSelector.label')} footer={state ? autoDescription(t, state.choice.model) : undefined}>
        <SelectRow
          first
          label={t('modelSelector.label')}
          value={state?.choice.model ?? ''}
          options={state ? models : loading}
          disabled={!state}
          onChange={(model) => change('model', model)}
          testID={`model-picker-${feature}`}
        />
        <SelectRow
          label={t('modelSelector.reasoning')}
          value={reasoning?.value ?? ''}
          options={state ? efforts : loading}
          disabled={!reasoning || reasoning.disabled}
          onChange={(effort) => change('reasoningEffort', effort)}
        />
      </FormGroup>
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.failed, { color: colors.destructive }]}>
          {t('mobile.you.saveFailed')}
        </Text>
      ) : null}
    </View>
  );
}

/** The same choice as chips beside Ask's options, where the website's Ask shows its ModelSelector. */
export function ModelChips({ feature, onChange }: { feature: FeatureTab; onChange: () => void }) {
  const { t } = useTranslation();
  const { state, failed, change } = useModelChoice(feature, onChange);
  const { models, efforts } = useOptions(state?.pro ?? false);
  const [open, setOpen] = useState<Field | null>(null);
  if (!state) return null;
  const reasoning = reasoningFor(state.choice, state.pro);
  const modelName = MODELS.find((model) => model.id === state.choice.model)?.name ?? state.choice.model;
  const effortLabel = efforts.find((effort) => effort.value === reasoning.value)?.label ?? reasoning.value;
  return (
    <>
      <Chip icon={failed ? 'alert' : 'sparkles'} label={modelName} onPress={() => setOpen('model')} testID="ask-model" />
      {reasoning.disabled ? null : (
        <Chip label={`${t('modelSelector.reasoning')}: ${effortLabel}`} onPress={() => setOpen('reasoningEffort')} testID="ask-reasoning" />
      )}
      <ActionMenu
        visible={open === 'model'}
        title={t('modelSelector.label')}
        items={models.map((model) => ({ key: model.value, label: model.label, disabled: model.disabled, icon: model.value === state.choice.model ? 'check' : undefined }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setOpen(null)}
        onSelect={(model) => change('model', model)}
      />
      <ActionMenu
        visible={open === 'reasoningEffort'}
        title={t('modelSelector.reasoning')}
        items={efforts.map((effort) => ({ key: effort.value, label: effort.label, icon: effort.value === reasoning.value ? 'check' : undefined }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setOpen(null)}
        onSelect={(effort) => change('reasoningEffort', effort)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  failed: { fontSize: 13.5, marginLeft: 4 },
});
