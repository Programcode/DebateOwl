import { Cpu } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_MODEL, DEFAULT_PROVIDERS, isReasoningEffort } from '@/lib/ai/providers/types';
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

const allModels = DEFAULT_PROVIDERS
  .flatMap(p => p.models.map(m => ({ ...m, provider: p.id, providerName: p.name })));

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
  const currentReasoning = (isPro || subscriptionLoading) && config?.reasoningEffort && isReasoningEffort(config.reasoningEffort)
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
            setFeatureConfig(feature, { model, provider: found.provider });
          }
        }}
      >
        <SelectTrigger className="h-10 w-full text-sm" aria-label={t('modelSelector.selectFor', 'Select AI model for {{feature}}', { feature })}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allModels.map((m) => (
            <SelectItem
              key={m.id}
              value={m.id}
              className="text-xs"
              disabled={m.isProOnly && !isPro}
            >
              <span className="flex items-center gap-2">
                {m.name}
                {m.isProOnly && <Badge variant="outline" className="text-[10px] px-1 py-0">Pro</Badge>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t('modelSelector.reasoning', 'Reasoning')}
        </Label>
        <Select
          value={currentReasoning}
          disabled={!isPro}
          onValueChange={(value) => {
            if (!isPro || !isReasoningEffort(value)) return;
            setFeatureConfig(feature, { reasoningEffort: value });
          }}
        >
          <SelectTrigger
            className="h-10 w-full text-sm"
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
