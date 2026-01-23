// src/components/layout/AppLayout.tsx
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { 
  Sparkles, 
  Swords, 
  Lightbulb, 
  BookOpen, 
  MessageCircle,
  Settings,
  Menu,
  X,
  Clock,
  Timer
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Generate', icon: Sparkles, description: 'Build arguments' },
  { path: '/attack', label: 'Attack', icon: Swords, description: 'Find weaknesses' },
  { path: '/brainstorm', label: 'Brainstorm', icon: Lightbulb, description: 'Explore ideas' },
  { path: '/factoids', label: 'Factoids', icon: BookOpen, description: 'Find evidence' },
  { path: '/ask', label: 'Ask', icon: MessageCircle, description: 'Get coaching' },
  { path: '/timer', label: 'Timer', icon: Timer, description: 'Practice timing' },
  { path: '/history', label: 'History', icon: Clock, description: 'Saved items' },
];

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">AI Debate Trainer</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Master the art of argumentation</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
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
            <NavLink to="/settings">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Settings className="h-5 w-5" />
              </Button>
            </NavLink>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
                  end={item.path === '/'}
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
        <div className="container px-4 text-center text-sm text-muted-foreground">
          <p>AI Debate Trainer • Built for debaters who demand excellence</p>
        </div>
      </footer>
    </div>
  );
}
