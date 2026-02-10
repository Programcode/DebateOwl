import { Link } from 'react-router-dom';
import {
  Sparkles,
  Swords,
  Lightbulb,
  BookOpen,
  MessageCircle,
  Database,
  Timer,
  GitBranch,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const modes = [
  {
    title: 'Generate',
    description: 'Build full debate cases with claims, warrants, and impacts.',
    icon: Sparkles,
    href: '/app/generate',
  },
  {
    title: 'Attack',
    description: 'Stress-test arguments and expose strategic weak points.',
    icon: Swords,
    href: '/app/attack',
  },
  {
    title: 'Brainstorm',
    description: 'Explore angles and discover fresh ways to frame motions.',
    icon: Lightbulb,
    href: '/app/brainstorm',
  },
  {
    title: 'Factoids',
    description: 'Find sourced evidence and debate-ready statistics.',
    icon: BookOpen,
    href: '/app/factoids',
  },
  {
    title: 'Ask',
    description: 'Chat with your coach for strategy, structure, and prep.',
    icon: MessageCircle,
    href: '/app/ask',
  },
  {
    title: 'Library',
    description: 'Manage and toggle sources used for grounded responses.',
    icon: Database,
    href: '/app/library',
  },
  {
    title: 'Timer',
    description: 'Practice speaking rounds with tournament timing controls.',
    icon: Timer,
    href: '/app/timer',
  },
  {
    title: 'Flowchart',
    description: 'Map arguments and rebuttal links in a visual debate tree.',
    icon: GitBranch,
    href: '/app/flowchart',
  },
  {
    title: 'History',
    description: 'Reopen saved cases, chats, and previous prep sessions.',
    icon: Clock,
    href: '/app/history',
  },
];

export default function HomePage() {
  return (
    <div className="container px-4 py-8">
      <div className="mx-auto flex min-h-[72vh] max-w-5xl flex-col justify-center">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">DebateLab</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a mode to start.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {modes.map((mode) => (
            <Link key={mode.title} to={mode.href} className="group">
              <Card
                className={cn(
                  'h-full border-border/70 bg-card/60 transition-all',
                  'hover:border-primary/40 hover:bg-card'
                )}
              >
                <CardHeader>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <CardTitle className="text-lg">{mode.title}</CardTitle>
                  <CardDescription>{mode.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
