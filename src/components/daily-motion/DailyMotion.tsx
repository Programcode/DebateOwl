import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { OwlMark } from '@/components/brand/Owl';
import Footer from '@/components/landing/Footer';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/SkipLink';
import site from '@/config/site.json';
import { dailyMotion, latestDayNumber } from '@/lib/daily-motion/schedule';
import { ARCHIVE_PATH, dailyMotionPath, formatName } from '@/lib/daily-motion/pages';
import { cn } from '@/lib/utils';

const pillClass = 'inline-flex items-center gap-1.5 rounded-full border-2 border-brand-tint-border bg-brand-tint px-4 py-2 text-sm font-bold text-primary no-underline! transition-colors hover:border-primary/50 pointer-coarse:min-h-11';

/**
 * Today's motion in one block, for the landing page, /ai-debate and the motion
 * generator. The build renders it for the day it ran; the browser re-renders
 * it for its own day.
 */
export function DailyMotionCard({ className, headingLevel = 2 }: { className?: string; headingLevel?: 2 | 3 }) {
  const day = dailyMotion(latestDayNumber());
  if (!day) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby="daily-motion-card" className={cn('not-prose rounded-xl border-2 border-border bg-card p-5 md:p-6', className)} data-testid="daily-motion-card">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Daily motion #{day.number} · {formatName(day)}
      </p>
      <Heading id="daily-motion-card" className="mt-2 text-balance font-display text-xl font-[600] leading-snug text-heading md:text-2xl">
        <Link to={dailyMotionPath(day.number)} className="text-heading! no-underline! hover:underline!">{day.wording}</Link>
      </Heading>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{day.clash}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={dailyMotionPath(day.number)} className={pillClass}>
          Speech times and both sides
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link to={ARCHIVE_PATH} className={pillClass}>All daily motions</Link>
      </div>
    </section>
  );
}

/** The header, main landmark and footer around /motion and each day's page, as on /ai-debate. */
export function DailyMotionShell({ crumbs, children }: { crumbs: { label: string; to?: string }[]; children: ReactNode }) {
  const { t } = useTranslation('tools');
  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <header className="border-b border-border/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to="/" aria-label={t('translation:common.homeLink')} className="flex items-center gap-2 rounded-md pointer-coarse:min-h-11">
            <OwlMark size={32} alt={t('translation:common.logoAlt')} />
            <span className="font-display text-lg font-[600] tracking-[-0.01em] text-heading">{site.product}</span>
          </Link>
          <Link to="/tools" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
            {t('layout.allTools')}
          </Link>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} className="container mx-auto px-4 pb-16 pt-6 focus-visible:outline-hidden">
        <nav aria-label={t('layout.breadcrumb')} className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link to="/" className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">{site.product}</Link></li>
            {crumbs.map((crumb) => (
              <li key={crumb.label} className="flex items-center gap-1">
                <span aria-hidden="true">/</span>
                {crumb.to
                  ? <Link to={crumb.to} className="inline-flex min-h-6 items-center hover:text-foreground pointer-coarse:min-h-11">{crumb.label}</Link>
                  : <span aria-current="page" className="text-foreground">{crumb.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        {children}
      </main>
      <Footer />
    </div>
  );
}
