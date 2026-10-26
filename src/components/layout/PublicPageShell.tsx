import type { ReactNode } from 'react';
import { OwlMark } from '@/components/brand/Owl';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/supabase/auth-context';
import { cn } from '@/lib/utils';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/SkipLink';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/** Where "home" is for this visitor: the app when signed in, the landing page otherwise. */
// eslint-disable-next-line react-refresh/only-export-components
export function useHomePath() {
  const { user } = useAuth();
  return user ? '/app' : '/';
}

/**
 * Frame for public reading pages (legal, sources, shared items, not found): a way home
 * at the top and a readable measure for long text.
 */
export function PublicPageShell({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const home = useHomePath();
  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <header className="border-b border-border/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <Link to={home} className="flex items-center gap-2 rounded-md pointer-coarse:min-h-11">
            <OwlMark size={32} alt={t('common.logoAlt')} />
            <span className="font-display text-lg font-[600] tracking-[-0.01em] text-heading">DebateLab</span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} className={cn('container mx-auto px-4 py-10 focus-visible:outline-hidden', className)}>{children}</main>
    </div>
  );
}
