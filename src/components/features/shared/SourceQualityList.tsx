import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { DiscoveredSource } from '@/lib/ai/client';

const QUALITY_STYLES: Record<string, string> = {
  strong: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  moderate: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  weak: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

interface SourceQualityListProps {
  sources: DiscoveredSource[];
  className?: string;
}

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Renders researched web sources with their auditable quality metadata.
 * Weak sources are explicitly labeled as fallback context so they can never
 * pass as supporting evidence.
 */
export function SourceQualityList({ sources, className }: SourceQualityListProps) {
  const { t } = useTranslation();
  if (!sources.length) return null;

  return (
    <ul className={`space-y-2 ${className ?? ''}`}>
      {sources.map((source, index) => {
        const linkable = isSafeHref(source.url);
        return (
          <li key={`${source.url}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
            {linkable ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium hover:underline"
              >
                {source.title || source.url}
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
              </a>
            ) : (
              <span className="font-medium">{source.title || source.url}</span>
            )}
            {source.sourceType && (
              <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                {t(`sourceQuality.types.${source.sourceType}`, source.sourceType)}
              </Badge>
            )}
            {source.qualityLabel && (
              <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${QUALITY_STYLES[source.qualityLabel] ?? ''}`}>
                {t(`sourceQuality.labels.${source.qualityLabel}`, source.qualityLabel)}
              </Badge>
            )}
            {source.qualityLabel === 'weak' && (
              <span className="text-xs text-muted-foreground">{t('sourceQuality.fallbackOnly')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
