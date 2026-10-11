// src/components/ui/section-card.tsx
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { LoadingOverlay } from './loading-spinner';

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  onRegenerate?: () => void;
  isLoading?: boolean;
  /** Disables the regenerate button without covering this card. */
  regenerateDisabled?: boolean;
  icon?: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  children,
  className,
  onRegenerate,
  isLoading,
  regenerateDisabled,
  icon,
}: SectionCardProps) {
  const { t } = useTranslation();
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      {isLoading && <LoadingOverlay message={t('common.regenerating', 'Regenerating {{title}}…', { title })} />}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon && <div className="text-primary">{icon}</div>}
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
          </div>
          {onRegenerate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRegenerate}
              disabled={isLoading || regenerateDisabled}
              className="h-8 w-8 shrink-0"
              aria-label={t('common.regenerate', 'Regenerate {{title}}', { title })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
