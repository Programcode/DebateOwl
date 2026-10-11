// src/components/layout/AppLayout.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  LayoutGrid,
  Settings,
  Menu,
  X,
  Clock,
  Database,
  Target,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { HeaderTooltip } from '@/components/layout/HeaderTooltip';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AnnouncementBanner } from '@/components/layout/AnnouncementBanner';
import { useRoutePrefetch } from '@/hooks/use-route-prefetch';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { CurrentDebateMenu } from '@/components/features/debate/CurrentDebateMenu';
import { useCurrentDebate } from '@/lib/stores/debate-store';
import { navSectionFor } from '@/components/layout/nav-sections';
import { DebateDialogs, InactiveDebateGate } from '@/components/features/debate/DebateDialogs';
import {
  dismissAnnouncement,
  listActiveAnnouncements,
  type UserAnnouncement,
} from '@/lib/announcements';

// Features live on Tools and the Current Debate dashboard, not in the header.
const libraryNavItems = [
  { path: '/app/library', key: 'library', icon: Database },
  { path: '/app/history', key: 'history', icon: Clock },
];

const mobileNavItems = [
  { path: '/app', key: 'tools', icon: LayoutGrid },
  { path: '/app/debate', key: 'currentDebate', icon: Target },
  ...libraryNavItems,
  { path: '/app/settings', key: 'settings', icon: Settings },
];

const desktopLinkClass = cn(
  "flex items-center gap-1.5 px-2 xl:px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
  "text-muted-foreground hover:text-foreground hover:bg-accent"
);
const activeLinkClass = "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary";

const ANNOUNCEMENT_CACHE_KEY = 'debatelab-announcements';

// The banner renders from the last fetch on reload, so it doesn't push the page down later.
function readCachedAnnouncements(userId: string | null): UserAnnouncement[] {
  if (!userId) return [];
  try {
    const cached = JSON.parse(sessionStorage.getItem(ANNOUNCEMENT_CACHE_KEY) ?? 'null') as { userId: string; announcements: UserAnnouncement[] } | null;
    return cached?.userId === userId ? filterVisibleAnnouncements(cached.announcements, Date.now()) : [];
  } catch {
    return [];
  }
}

function writeCachedAnnouncements(userId: string, announcements: UserAnnouncement[]) {
  try {
    sessionStorage.setItem(ANNOUNCEMENT_CACHE_KEY, JSON.stringify({ userId, announcements }));
  } catch {
    // Storage can be full or blocked; the banner then just waits for the fetch.
  }
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 0);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return scrolled;
}

const ANNOUNCEMENTS_STALE_MS = 60_000;

function filterVisibleAnnouncements(announcements: UserAnnouncement[], now: number) {
  return announcements.filter((announcement) => {
    const startsAt = new Date(announcement.startsAt).getTime();
    const expiresAt = announcement.expiresAt ? new Date(announcement.expiresAt).getTime() : Infinity;
    return startsAt <= now && expiresAt > now;
  });
}

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [announcements, setAnnouncements] = useState<UserAnnouncement[]>(() => readCachedAnnouncements(userId));
  const [announcementsUserId, setAnnouncementsUserId] = useState<string | null>(userId);
  const [dismissError, setDismissError] = useState<{ announcementId: string; message: string } | null>(null);
  const dismissedAnnouncementIds = useRef(new Set<string>());
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const lastRequestAtRef = useRef<number | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const location = useLocation();
  const hasDebate = Boolean(useCurrentDebate());
  const section = navSectionFor(location.pathname, hasDebate);
  const scrolled = useScrolled();
  const homePrefetch = useRoutePrefetch('/app');
  const termsPrefetch = useRoutePrefetch('/terms');
  const privacyPrefetch = useRoutePrefetch('/privacy');

  const loadAnnouncements = useCallback(async (force = false) => {
    if (!userId) return;

    const requestedAt = Date.now();
    const lastRequestedAt = lastRequestAtRef.current;
    if (!force && lastRequestedAt !== null && requestedAt - lastRequestedAt < ANNOUNCEMENTS_STALE_MS) {
      setAnnouncements((current) => filterVisibleAnnouncements(current, requestedAt));
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    lastRequestAtRef.current = requestedAt;

    try {
      const active = await listActiveAnnouncements(controller.signal);
      if (controller.signal.aborted || activeUserIdRef.current !== userId) return;
      const visible = filterVisibleAnnouncements(
        active.filter((announcement) => !dismissedAnnouncementIds.current.has(announcement.id)),
        Date.now(),
      );
      setAnnouncementsUserId(userId);
      setAnnouncements(visible);
      writeCachedAnnouncements(userId, visible);
    } catch (error) {
      if (!controller.signal.aborted && activeUserIdRef.current === userId && activeRequestRef.current === controller) {
        lastRequestAtRef.current = null;
        console.warn('[Announcements] Unable to load', error instanceof Error ? error.message : 'Unknown error');
        setAnnouncements([]);
      }
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  }, [userId]);

  useEffect(() => {
    activeUserIdRef.current = userId;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    lastRequestAtRef.current = null;
    dismissedAnnouncementIds.current.clear();
    setAnnouncementsUserId(userId);
    setAnnouncements(readCachedAnnouncements(userId));
    setDismissError(null);
    if (userId) void loadAnnouncements(true);

    return () => activeRequestRef.current?.abort();
  }, [loadAnnouncements, userId]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setDismissError(null);
    setAnnouncements((current) => filterVisibleAnnouncements(current, Date.now()));
    void loadAnnouncements();
  }, [loadAnnouncements, location.pathname]);

  // The menu is `lg:hidden`: widening the window would hide it while it still holds the page modal.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    const close = () => { if (wide.matches) setMobileMenuOpen(false); };
    close();
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (announcementsUserId !== userId) return;
    const nextExpiry = Math.min(...announcements
      .map((announcement) => announcement.expiresAt ? new Date(announcement.expiresAt).getTime() : Infinity));
    if (!Number.isFinite(nextExpiry)) return;

    const timer = window.setTimeout(() => {
      setAnnouncements((current) => filterVisibleAnnouncements(current, Date.now()));
    }, Math.min(Math.max(0, nextExpiry - Date.now()), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [announcements, announcementsUserId, userId]);

  // The mobile menu opens just below the whole header (two rows on phones), whatever its height.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--app-header-bottom', `${header.getBoundingClientRect().bottom}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
    };
  }, []);

  // Dismiss is optimistic: the banner goes at once and comes back only if the server refuses.
  const handleDismissAnnouncement = async (announcementId: string) => {
    const requestUserId = userId;
    const dismissed = announcements.find((announcement) => announcement.id === announcementId);
    if (!dismissed || !requestUserId) return;
    dismissedAnnouncementIds.current.add(announcementId);
    setDismissError(null);
    const remaining = announcements.filter((announcement) => announcement.id !== announcementId);
    setAnnouncements(remaining);
    writeCachedAnnouncements(requestUserId, remaining);
    try {
      await dismissAnnouncement(announcementId);
    } catch (error) {
      if (activeUserIdRef.current !== requestUserId) return;
      dismissedAnnouncementIds.current.delete(announcementId);
      setAnnouncements((current) => {
        const restored = [dismissed, ...current.filter((announcement) => announcement.id !== announcementId)];
        // The cache is what the next page load renders first, so it has to come back too.
        writeCachedAnnouncements(requestUserId, restored);
        return restored;
      });
      setDismissError({
        announcementId,
        message: error instanceof Error ? error.message : t('announcements.dismissError'),
      });
    }
  };

  return (
    <div className="native-safe-screen flex flex-col bg-background">
      {/* Header: the edge appears once content scrolls under it. */}
      <header
        ref={headerRef}
        className={cn(
          "native-safe-top sticky top-[var(--staging-banner-height,0px)] z-50 border-b bg-card/80 backdrop-blur-xl transition-colors",
          scrolled ? "border-border/60" : "border-transparent",
        )}
      >
        <div className="container flex h-16 items-center justify-between px-4 max-[359px]:px-2">
          <Link to="/app" {...homePrefetch} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 shrink-0 rounded-md pointer-coarse:min-h-11">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white dark:bg-slate-800 overflow-hidden shrink-0">
              <img src="/favicon-72.png" alt={t('common.logoAlt')} width={36} height={36} className="h-full w-full object-cover" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground whitespace-nowrap">DebateLab</span>
          </Link>

          {/* Desktop Nav */}
          <nav aria-label={t('nav.mainNavigation')} className="hidden lg:flex min-w-0 flex-1 items-center gap-0.5 xl:gap-1 ml-4">
            <Link
              to="/app"
              {...homePrefetch}
              data-tour="nav-home"
              aria-current={location.pathname === '/app' ? 'page' : undefined}
              className={cn(desktopLinkClass, section === 'tools' && activeLinkClass)}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('nav.tools')}</span>
            </Link>
            <CurrentDebateMenu variant="desktop" />
            {libraryNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end
                data-tour={`nav-${item.key}`}
                className={desktopLinkClass}
                activeClassName={activeLinkClass}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(`nav.${item.key}`)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 max-[359px]:gap-1 shrink-0">
            <LanguageSwitcher />
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
            <HeaderTooltip label={t('nav.settings', 'Settings')}>
              <NavLink
                to="/app/settings"
                aria-label={t('nav.settings', 'Settings')}
                data-tour="nav-settings"
                className="hidden lg:inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                activeClassName={activeLinkClass}
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </NavLink>
            </HeaderTooltip>
            <DialogPrimitive.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <DialogPrimitive.Trigger asChild>
                <Button
                  ref={mobileMenuTriggerRef}
                  variant="ghost"
                  size="icon"
                  className="lg:hidden text-muted-foreground"
                  aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </DialogPrimitive.Trigger>
              {/* Mobile Nav: a modal panel under the header, with a scrim over the page. */}
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 ease-out-strong data-[state=open]:duration-180 data-[state=closed]:duration-120" />
                <DialogPrimitive.Content
                  aria-describedby={undefined}
                  className="native-scroll-y native-mobile-menu fixed inset-x-0 top-[var(--app-header-bottom,8rem)] z-40 overflow-y-auto border-b border-border bg-card p-4 shadow-lg lg:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 ease-out-strong data-[state=open]:duration-180 data-[state=closed]:duration-120"
                >
                  <DialogPrimitive.Title className="sr-only">{t('nav.mobileNavigation')}</DialogPrimitive.Title>
                  <nav aria-label={t('nav.mobileNavigation')}>
                    <div className="grid gap-1 pb-[var(--native-safe-bottom,0px)]">
                      {mobileNavItems.map((item) => {
                        const active = item.key === 'tools' ? section === 'tools'
                          : item.key === 'currentDebate' ? section === 'debate'
                          : location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            aria-current={location.pathname === item.path ? 'page' : undefined}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                              active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent",
                            )}
                          >
                            <item.icon className="h-5 w-5" aria-hidden="true" />
                            <div>
                              <div className="font-medium">{t(`nav.${item.key}`)}</div>
                              <div className="text-xs opacity-70">{t(`navDesc.${item.key}`)}</div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </nav>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
          </div>
        </div>

        {/* Mobile Current Debate row */}
        <div className="container min-w-0 border-t border-border/60 px-4 py-1 max-[359px]:px-2 lg:hidden">
          <CurrentDebateMenu variant="mobile" />
        </div>
      </header>

      {announcementsUserId === userId && announcements[0] && (
        <AnnouncementBanner
          announcement={announcements[0]}
          position={1}
          total={announcements.length}
          error={dismissError?.announcementId === announcements[0].id ? dismissError.message : null}
          onDismiss={() => handleDismissAnnouncement(announcements[0].id)}
        />
      )}

      <DebateDialogs />
      <InactiveDebateGate />

      {/* Main Content */}
      <main className="native-main-content flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="native-safe-bottom border-t border-border bg-card/50 pt-4">
        <div className="container flex flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground md:flex-row">
          <p className="font-medium">DebateLab</p>
          <div className="flex items-center gap-4">
            <Link to="/terms" {...termsPrefetch} className="inline-flex items-center justify-center rounded-sm transition-colors hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11">{t('footer.terms')}</Link>
            <Link to="/privacy" {...privacyPrefetch} className="inline-flex items-center rounded-sm transition-colors hover:text-foreground pointer-coarse:min-h-11">{t('footer.privacy')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
