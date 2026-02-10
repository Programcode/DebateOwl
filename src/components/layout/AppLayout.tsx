// src/components/layout/AppLayout.tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
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

const navItems = [
  { path: '/app', label: 'Home', icon: Home, description: 'Choose a mode' },
  { path: '/app/generate', label: 'Generate', icon: Sparkles, description: 'Build arguments' },
  { path: '/app/attack', label: 'Attack', icon: Swords, description: 'Find weaknesses' },
  { path: '/app/brainstorm', label: 'Brainstorm', icon: Lightbulb, description: 'Explore ideas' },
  { path: '/app/factoids', label: 'Factoids', icon: BookOpen, description: 'Find evidence' },
  { path: '/app/ask', label: 'Ask', icon: MessageCircle, description: 'Get coaching' },
  { path: '/app/library', label: 'Library', icon: Database, description: 'Manage sources' },
  { path: '/app/timer', label: 'Timer', icon: Timer, description: 'Practice timing' },
  { path: '/app/flowchart', label: 'Flowchart', icon: GitBranch, description: 'Map arguments' },
  { path: '/app/history', label: 'History', icon: Clock, description: 'Saved items' },
];

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/app'}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                activeClassName="bg-primary/10 text-primary"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavLink to="/app/settings">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" aria-label="Settings">
                <Settings className="h-5 w-5" />
              </Button>
            </NavLink>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-card p-4">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/app'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  activeClassName="bg-primary/10 text-primary"
                >
                  <item.icon className="h-5 w-5" />
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs opacity-70">{item.description}</div>
                  </div>
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-4">
        <div className="container flex flex-col items-center justify-between gap-2 px-4 text-sm text-muted-foreground md:flex-row">
          <p>DebateLab • Built for debaters who demand excellence</p>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
