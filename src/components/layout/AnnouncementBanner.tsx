import { Loader2, Megaphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { UserAnnouncement } from '@/lib/announcements';

interface AnnouncementBannerProps {
  announcement: UserAnnouncement;
  position: number;
  total: number;
  dismissing: boolean;
  error: string | null;
  onDismiss: () => void;
}

export function AnnouncementBanner({
  announcement,
  position,
  total,
  dismissing,
  error,
  onDismiss,
}: AnnouncementBannerProps) {
  const { t } = useTranslation();

  return (
    <section
      aria-live="polite"
      aria-label={t('announcements.regionLabel')}
      className="border-b border-primary/20 bg-primary/[0.06]"
    >
      <div className="container flex items-start gap-3 px-4 py-3 sm:items-center">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="font-semibold text-foreground">{announcement.title}</h2>
            {total > 1 && (
              <span className="text-xs text-muted-foreground">
                {t('announcements.position', { position, total })}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {announcement.body}
          </p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={onDismiss}
          disabled={dismissing}
          aria-label={t('announcements.dismissLabel', { title: announcement.title })}
        >
          {dismissing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </section>
  );
}
