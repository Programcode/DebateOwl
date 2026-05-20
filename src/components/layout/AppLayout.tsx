// src/components/layout/AppLayout.tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Sparkles,
  Swords,
  Lightbulb,
  BookOpen,
  MessageCircle,
  Settings,
  Menu,
  X,
  Clock,
  Timer,
  Database,
  GitBranch
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const navItems = [
  { path: '/app', key: 'home', icon: Home },
  { path: '/app/generate', key: 'generate', icon: Sparkles },
  { path: '/app/attack', key: 'attack', icon: Swords },
  { path: '/app/brainstorm', key: 'brainstorm', icon: Lightbulb },
  { path: '/app/factoids', key: 'factoids', icon: BookOpen },
  { path: '/app/ask', key: 'ask', icon: MessageCircle },
  { path: '/app/library', key: 'library', icon: Database },
  { path: '/app/timer', key: 'timer', icon: Timer },
  { path: '/app/flowchart', key: 'flowchart', icon: GitBranch },
  { path: '/app/history', key: 'history', icon: Clock },
];

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
              <img src="/favicon.ico" alt="DebateLab" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">DebateLab</h1>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/app'}
                className={cn(
                  "motion-press nav-glow flex items-center gap-1.5 px-2 xl:px-3 py-2 rounded-md text-sm font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                activeClassName="bg-primary/10 text-primary nav-active-pill"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden xl:inline">{t(`nav.${item.key}`)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden xl:block">
              <LanguageSwitcher />
            </div>
            <ThemeToggle />
            <NavLink to="/app/settings">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" aria-label="Settings">
                <Settings className="h-5 w-5" />
              </Button>
            </NavLink>
            <Button
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
          <nav className="motion-reveal lg:hidden border-t border-border bg-card p-4">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/app'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "motion-press flex items-center gap-3 px-3 py-3 rounded-lg",
                    "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  activeClassName="bg-primary/10 text-primary"
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

      {/* Main Content */}
      <main className="flex-1 page-enter">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-4">
        <div className="container flex flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground md:flex-row">
          <p>DebateLab</p>
          <div className="flex items-center gap-4">
            <a href="/terms" className="motion-press rounded-sm hover:text-foreground">{t('footer.terms')}</a>
            <a href="/privacy" className="motion-press rounded-sm hover:text-foreground">{t('footer.privacy')}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
