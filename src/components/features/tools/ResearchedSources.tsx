import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { DiscoveredSource } from '@/lib/ai/client';
import { SourceQualityList } from '@/components/features/shared/SourceQualityList';

/** The web sources a result was researched from, folded under the result header. */
export function ResearchedSources({ sources }: { sources?: DiscoveredSource[] }) {
  const { t } = useTranslation();
  if (!sources?.length) return null;
  return (
    <details className="group rounded-lg border bg-card/50 p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {t('tools.researchedSources', { total: sources.length, defaultValue: 'Researched sources ({{total}})' })}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-150 ease-out-strong group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3">
        <SourceQualityList sources={sources} className="[&_a]:break-words" />
        <p className="mt-3 text-xs text-muted-foreground">{t('sourceQuality.fallbackNote')}</p>
      </div>
    </details>
  );
}
