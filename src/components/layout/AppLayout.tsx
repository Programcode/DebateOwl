// src/components/layout/AppLayout.tsx
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Sparkles,
  Swords,
  Lightbulb,
  BookOpen,
  ChevronDown,
  MessageCircle,
  Settings,
  Menu,
  X,
  Clock,
  Timer,
  Dumbbell,
  Database,
  GitBranch,
  Crosshair
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AnnouncementBanner } from '@/components/layout/AnnouncementBanner';
import {
  dismissAnnouncement,
  listActiveAnnouncements,
  type UserAnnouncement,
} from '@/lib/announcements';

const navItems = [
  { path: '/app', key: 'home', icon: Home },
  { path: '/app/generate', key: 'generate', icon: Sparkles },
  { path: '/app/attack', key: 'attack', icon: Swords },
  { path: '/app/brainstorm', key: 'brainstorm', icon: Lightbulb },
  { path: '/app/factoids', key: 'factoids', icon: BookOpen },
  { path: '/app/ask', key: 'ask', icon: MessageCircle },
  { path: '/app/crossfire', key: 'crossfire', icon: Crosshair },
  { path: '/app/library', key: 'library', icon: Database },
  { path: '/app/timer', key: 'timer', icon: Timer },
  { path: '/app/sparring', key: 'sparring', icon: Dumbbell },
  { path: '/app/flowchart', key: 'flowchart', icon: GitBranch },
  { path: '/app/history', key: 'history', icon: Clock },
];

const primaryNavItems = navItems.filter((item) =>
  ['home', 'generate', 'attack', 'ask', 'crossfire', 'sparring'].includes(item.key),
);

const moreNavItems = navItems.filter((item) => !primaryNavItems.includes(item));

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<UserAnnouncement[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<{ announcementId: string; message: string } | null>(null);
  const dismissedAnnouncementIds = useRef(new Set<string>());
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    const loadAnnouncements = async () => {
      try {
        const active = await listActiveAnnouncements(controller.signal);
        if (!controller.signal.aborted) {
          setAnnouncements(active.filter(
            (announcement) => !dismissedAnnouncementIds.current.has(announcement.id),
          ));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[Announcements] Unable to load', error instanceof Error ? error.message : 'Unknown error');
          setAnnouncements([]);
        }
      }
    };
    setDismissError(null);
    void loadAnnouncements();
    return () => controller.abort();
  }, [location.pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
    moreMenuRef.current?.removeAttribute('open');
  }, [location.pathname]);

  useEffect(() => {
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileMenuOpen(false);
      if (moreMenuRef.current?.hasAttribute('open')) {
        moreMenuRef.current.removeAttribute('open');
        moreMenuRef.current.querySelector('summary')?.focus();
      }
      if (mobileMenuOpen) mobileMenuTriggerRef.current?.focus();
    };
    document.addEventListener('keydown', closeMenus);
    return () => document.removeEventListener('keydown', closeMenus);
  }, [mobileMenuOpen]);

  const handleDismissAnnouncement = async (announcementId: string) => {
    try {
      setDismissingId(announcementId);
      setDismissError(null);
      await dismissAnnouncement(announcementId);
      dismissedAnnouncementIds.current.add(announcementId);
      setAnnouncements((current) => current.filter((announcement) => announcement.id !== announcementId));
    } catch (error) {
      setDismissError({
        announcementId,
        message: error instanceof Error ? error.message : t('announcements.dismissError'),
      });
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <div className="native-safe-screen flex flex-col bg-background">
      {/* Header */}
      <header className="native-safe-top sticky top-0 z-50 border-b border-border/60 bg-card/70 backdrop-blur-xl shadow-[0_1px_3px_hsl(var(--foreground)/0.04)]">
        <div className="container flex h-16 items-center justify-between px-4 max-[359px]:px-2">
          <Link to="/app" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 overflow-hidden shrink-0">
              <img src="/favicon.png" alt="DebateLab" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">DebateLab</h1>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-0.5 xl:gap-1 ml-4">
            {primaryNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/app'}
                aria-label={t(`nav.${item.key}`)}
                data-tour={`nav-${item.key}`}
                className={cn(
                  "motion-press nav-glow flex items-center gap-1.5 px-2 xl:px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap",
                  "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                activeClassName="bg-primary/10 text-primary nav-active-pill"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden xl:inline">{t(`nav.${item.key}`)}</span>
              </NavLink>
            ))}
            <details ref={moreMenuRef} className="relative">
              <summary
                className={cn(
                  'motion-press nav-glow flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground',
                  '[&::-webkit-details-marker]:hidden',
                  moreNavItems.some((item) => location.pathname === item.path) && 'bg-primary/10 text-primary nav-active-pill',
                )}
                aria-label={t('nav.more', 'More')}
                data-tour="nav-more"
              >
                {t('nav.more', 'More')}
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-10 mt-2 grid min-w-48 gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg">
                {moreNavItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    onClick={() => moreMenuRef.current?.removeAttribute('open')}
                    aria-label={t(`nav.${item.key}`)}
                    data-tour={`nav-${item.key}`}
                    className="motion-press flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    activeClassName="bg-primary/10 text-primary"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{t(`nav.${item.key}`)}</span>
                  </NavLink>
                ))}
              </div>
            </details>
          </nav>

          <div className="flex items-center gap-1.5 max-[359px]:gap-1 shrink-0">
            <LanguageSwitcher />
            <ThemeToggle />
            <NavLink
              to="/app/settings"
              aria-label={t('nav.settings', 'Settings')}
              data-tour="nav-settings"
              className="motion-press inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              activeClassName="bg-primary/10 text-primary"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
            </NavLink>
            <Button
              ref={mobileMenuTriggerRef}
              variant="ghost"
              size="icon"
              className="lg:hidden text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="motion-reveal native-scroll-y native-mobile-menu overflow-y-auto border-t border-border bg-card p-4 lg:hidden" aria-label="Mobile navigation">
            <div className="grid gap-1 pb-[var(--native-safe-bottom,0px)]">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/app'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "motion-press flex items-center gap-3 px-3 py-2.5 rounded-lg",
                    "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  activeClassName="bg-primary/10 text-primary font-semibold"
                >
                  <item.icon className="h-5 w-5" />
                  <div>
                    <div className="font-medium">{t(`nav.${item.key}`)}</div>
                    <div className="text-xs opacity-70">{t(`navDesc.${item.key}`)}</div>
                  </div>
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {announcements[0] && (
        <AnnouncementBanner
          announcement={announcements[0]}
          position={1}
          total={announcements.length}
          dismissing={dismissingId === announcements[0].id}
          error={dismissError?.announcementId === announcements[0].id ? dismissError.message : null}
          onDismiss={() => handleDismissAnnouncement(announcements[0].id)}
        />
      )}

      {/* Main Content */}
      <main className="native-main-content flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="native-safe-bottom border-t border-border bg-card/50 pt-4">
        <div className="container flex flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground md:flex-row">
          <p className="font-medium">DebateLab</p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="motion-press rounded-sm hover:text-foreground transition-colors">{t('footer.terms')}</Link>
            <Link to="/privacy" className="motion-press rounded-sm hover:text-foreground transition-colors">{t('footer.privacy')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
