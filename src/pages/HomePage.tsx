import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Swords,
  Lightbulb,
  BookOpen,
  MessageCircle,
  Crosshair,
  Database,
  Timer,
  Dumbbell,
  GitBranch,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const modeKeys = [
  { key: 'generate', icon: Sparkles, href: '/app/generate' },
  { key: 'attack', icon: Swords, href: '/app/attack' },
  { key: 'brainstorm', icon: Lightbulb, href: '/app/brainstorm' },
  { key: 'factoids', icon: BookOpen, href: '/app/factoids' },
  { key: 'ask', icon: MessageCircle, href: '/app/ask' },
  { key: 'crossfire', icon: Crosshair, href: '/app/crossfire' },
  { key: 'library', icon: Database, href: '/app/library' },
  { key: 'timer', icon: Timer, href: '/app/timer' },
  { key: 'flowchart', icon: GitBranch, href: '/app/flowchart' },
  { key: 'history', icon: Clock, href: '/app/history' },
];

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto flex min-h-[72vh] max-w-5xl flex-col justify-center">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{t('home.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('home.subtitle')}</p>
        </div>

        <Link to="/app/sparring" className="group mb-4 block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Card
            data-tour="mode-sparring"
            className={cn(
              'border-primary/30 bg-primary/[0.035] transition-colors hover:border-primary/50 hover:bg-primary/[0.06]',
              'hover-lift'
            )}
          >
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 sm:gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <Dumbbell className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg">{t('home.sparring')}</CardTitle>
                <CardDescription className="mt-1">{t('home.sparringDesc')}</CardDescription>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" />
            </CardHeader>
          </Card>
        </Link>

        <div className="grid gap-4 md:grid-cols-3 stagger-enter">
          {modeKeys.map((mode) => (
            <Link key={mode.key} to={mode.href} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg">
              <Card
                data-tour={`mode-${mode.key}`}
                className={cn(
                  'h-full border-border/70 bg-card/60 hover-lift',
                  'hover:border-primary/40 hover:bg-card'
                )}
              >
                <CardHeader>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary motion-reduce:group-hover:translate-x-0" />
                  </div>
                  <CardTitle className="text-lg">{t(`home.${mode.key}`)}</CardTitle>
                  <CardDescription>{t(`home.${mode.key}Desc`)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
