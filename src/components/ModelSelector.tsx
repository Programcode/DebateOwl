import { Cpu } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_PROVIDERS } from '@/lib/ai/providers/types';
import { useSettingsStore, type FeatureTab } from '@/lib/stores/settings-store';

interface ModelSelectorProps {
  feature: FeatureTab;
}

const allModels = DEFAULT_PROVIDERS
  .filter(p => p.id === 'google' || p.id === 'openai' || p.id === 'anthropic')
  .flatMap(p => p.models.map(m => ({ ...m, provider: p.id, providerName: p.name })));

export function ModelSelector({ feature }: ModelSelectorProps) {
  const { featureConfigs, setFeatureConfig } = useSettingsStore();
  const config = featureConfigs?.[feature];
  const currentModel = config?.model || 'gemini-3-flash-preview';

  return (
    <div className="flex items-center gap-2">
      <Cpu className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
      <Select
        value={currentModel}
        onValueChange={(model) => {
          const found = allModels.find(m => m.id === model);
          if (found) setFeatureConfig(feature, { model, provider: found.provider });
        }}
      >
        <SelectTrigger className="h-8 text-xs w-[160px] sm:w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allModels.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              <span className="flex items-center gap-2">
                {m.name}
                {m.isProOnly && <Badge variant="outline" className="text-[10px] px-1 py-0">Pro</Badge>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
