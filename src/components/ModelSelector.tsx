import { Cpu } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AUTO_MODEL_SELECTIONS,
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  PROVIDER_ID,
  isAutoModelSelection,
  isReasoningEffort,
} from '@/lib/ai/providers/types';
import type { ReasoningEffort } from '@/lib/ai/providers/types';
import { useSettingsStore, type FeatureTab } from '@/lib/stores/settings-store';
import { useSubscription } from '@/hooks/use-subscription';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ModelSelectorProps {
  feature: FeatureTab;
  className?: string;
  showLabel?: boolean;
}

// Every catalog model routes through OpenRouter, so the provider fan-out that
// used to wrap this collapses to one tag.
const allModels = [
  ...AUTO_MODEL_SELECTIONS.map((model) => ({ ...model, provider: PROVIDER_ID, providerName: 'OpenRouter', isAuto: true })),
  ...AVAILABLE_MODELS.map((model) => ({ ...model, provider: PROVIDER_ID, providerName: 'OpenRouter', isAuto: false })),
];

const reasoningOptions: { value: ReasoningEffort; labelKey: string; fallback: string }[] = [
  { value: 'low', labelKey: 'modelSelector.reasoningLow', fallback: 'Low' },
  { value: 'medium', labelKey: 'modelSelector.reasoningMedium', fallback: 'Medium' },
  { value: 'high', labelKey: 'modelSelector.reasoningHigh', fallback: 'High' },
];

export function ModelSelector({ feature, className, showLabel = false }: ModelSelectorProps) {
  const { t } = useTranslation();
  const { featureConfigs, setFeatureConfig } = useSettingsStore();
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const config = featureConfigs?.[feature];
  const selectedModel = allModels.find((model) => model.id === config?.model);
  const currentModel = selectedModel?.id ?? DEFAULT_MODEL;
  const automatic = isAutoModelSelection(currentModel);
  const shownModel = allModels.find((model) => model.id === currentModel) ?? allModels[0];
  const autoDescription = (id: string) => id === 'auto-fast'
    ? t('modelSelector.autoFastDescription', 'Fast routing, usually GLM')
    : t('modelSelector.autoProDescription', 'Routes among the strongest models');
  const currentReasoning = !automatic && (isPro || subscriptionLoading) && config?.reasoningEffort && isReasoningEffort(config.reasoningEffort)
    ? config.reasoningEffort
    : 'low';

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <Label className="flex h-5 items-center gap-2 text-sm font-medium">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          {t('modelSelector.label', 'AI model')}
        </Label>
      )}
      <Select
        value={currentModel}
        onValueChange={(model) => {
          const found = allModels.find(m => m.id === model);
          if (found) {
            if (found.isProOnly && !isPro) return;
            setFeatureConfig(feature, { model, provider: PROVIDER_ID });
          }
        }}
      >
        <SelectTrigger className="h-10 w-full text-sm" aria-label={t('modelSelector.selectFor', 'Select AI model for {{feature}}', { feature: t(`nav.${feature}`, feature).toLowerCase() })}>
          {/* Only the name fits the field on a phone; an Auto choice's description goes below it. */}
          <SelectValue>{shownModel.name}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allModels.map((m) => (
            <SelectItem
              key={m.id}
              value={m.id}
              className="text-xs whitespace-normal"
              disabled={m.isProOnly && !isPro}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {m.name}
                    {m.isProOnly && <Badge variant="outline" className="text-xs px-1 py-0">Pro</Badge>}
                  </span>
                  {m.isAuto && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{autoDescription(m.id)}</span>
                  )}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {shownModel.isAuto && (
        <p data-testid="model-auto-description" className="text-xs leading-5 text-muted-foreground">{autoDescription(shownModel.id)}</p>
      )}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t('modelSelector.reasoning', 'Reasoning')}
        </Label>
        <Select
          value={currentReasoning}
          disabled={!isPro || automatic}
          onValueChange={(value) => {
            if (!isPro || automatic || !isReasoningEffort(value)) return;
            setFeatureConfig(feature, { reasoningEffort: value });
          }}
        >
          {/* Locked, not broken: the dimmed field keeps its value readable (4.5:1) instead of fading to 50%. */}
          <SelectTrigger
            className="h-10 w-full text-sm disabled:bg-muted/50 disabled:text-muted-foreground disabled:opacity-100"
            aria-label={t('modelSelector.reasoning', 'Reasoning')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {reasoningOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {t(option.labelKey, option.fallback)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
