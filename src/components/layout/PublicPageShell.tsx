import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { cn } from '@/lib/utils';

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
      <header className="border-b border-border/60">
        <div className="container flex h-14 items-center px-4">
          <Link to={home} className="flex items-center gap-2 rounded-md pointer-coarse:min-h-11">
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white dark:bg-slate-800">
              <img src="/favicon-72.png" alt={t('common.logoAlt')} width={32} height={32} className="h-full w-full object-cover" />
            </span>
            <span className="font-semibold tracking-tight text-foreground">DebateLab</span>
          </Link>
        </div>
      </header>
      <main className={cn('container mx-auto px-4 py-10', className)}>{children}</main>
    </div>
  );
}
